import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { getConfig } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { isTicketStaff } from '../permissions.js';
import { safeDefer, safeError, safeReply } from '../respond.js';
import {
  countOpenTicketsFor,
  getTicketByChannel,
  nextTicketId,
  saveTicket,
  updateTicket,
} from '../db.js';
import { buildTicketEmbed, buildTicketRow } from '../ticketUi.js';
import { parseUserId, sanitizeName } from '../ticketForms.js';
import { handleConfigModal } from '../systems/config/ConfigInteractionHandler.js';

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

export async function handleModal(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('config:modal:')) return handleConfigModal(interaction);

  if (customId === 'ticket_rename_modal') return renameTicket(interaction);
  if (customId === 'ticket_add_modal') return addUserToTicket(interaction);
  if (customId === 'ticket_remove_modal') return removeUserFromTicket(interaction);
  if (customId.startsWith('ticket_modal:')) return createTicket(interaction);

  return false;
}

async function createTicket(interaction) {
  const category = interaction.customId.split(':')[1] ?? 'autre';

  let subject;
  let description;
  try {
    subject = interaction.fields.getTextInputValue('ticket_subject').trim();
    description = interaction.fields.getTextInputValue('ticket_description').trim();
  } catch {
    return safeError(interaction, 'Formulaire incomplet.');
  }

  const config = getConfig();
  const guild = interaction.guild;
  const member = interaction.member;

  if (!config.ticketCategoryId) return safeError(interaction, 'Aucune catégorie de tickets configurée.');
  if (!subject) return safeError(interaction, 'Le sujet ne peut pas être vide.');

  const parent = await guild.channels.fetch(config.ticketCategoryId).catch(() => null);
  if (!parent || parent.type !== ChannelType.GuildCategory) {
    return safeError(interaction, 'La catégorie de tickets configurée est invalide.');
  }

  const open = countOpenTicketsFor(member.id);
  if (open >= config.ticketLimitPerUser) {
    return safeError(interaction, `Limite atteinte : ${open}/${config.ticketLimitPerUser} ticket(s) ouvert(s).`);
  }

  if (!(await safeDefer(interaction, EPHEMERAL))) return true;

  try {
    const id = nextTicketId();
    const name = `ticket-${sanitizeName(member.user.username)}-${id}`;

    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: interaction.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ];

    for (const roleId of [config.ticketStaffRoleId, config.staffRoleId]) {
      if (roleId && !overwrites.some((o) => o.id === roleId)) {
        overwrites.push({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ManageChannels,
          ],
        });
      }
    }

    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parent.id,
      topic: `Ticket #${id} — ${member.user.tag} — ${subject.slice(0, 150)}`,
      permissionOverwrites: overwrites,
    });

    const ticket = {
      id,
      channelId: channel.id,
      guildId: guild.id,
      userId: member.id,
      username: member.user.tag,
      category,
      subject,
      description,
      status: 'open',
      priority: 'normale',
      claimedBy: null,
      createdAt: new Date().toISOString(),
      closedAt: null,
      closedBy: null,
      closeReason: null,
      messageCount: 0,
      panelMessageId: null,
      addedUsers: [],
    };
    saveTicket(ticket);

    const panel = await channel.send({
      content: `<@${member.id}>${config.ticketStaffRoleId ? ` <@&${config.ticketStaffRoleId}>` : ''}`,
      embeds: [buildTicketEmbed(ticket)],
      components: [buildTicketRow(ticket)],
    });
    updateTicket(channel.id, { panelMessageId: panel.id });

    await log(interaction.client, 'tickets', 'open', {
      guild,
      fields: [
        { name: 'Ticket', value: `#${id} — <#${channel.id}>`, inline: true },
        { name: 'Auteur', value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: 'Catégorie', value: category, inline: true },
        { name: 'Sujet', value: subject.slice(0, 500), inline: false },
      ],
    });

    return safeReply(interaction, {
      embeds: [buildEmbed({ dark: true, title: 'Ticket ouvert', description: `Ton ticket est prêt : <#${channel.id}>` })],
    });
  } catch (err) {
    console.error(`[alln-utils] création ticket: ${err.stack ?? err.message}`);
    return safeReply(interaction, {
      embeds: [buildEmbed({ dark: true, title: 'Échec', description: 'Création du ticket impossible. Vérifie les permissions du bot.' })],
    });
  }
}

async function renameTicket(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket) return safeError(interaction, 'Ce salon n’est pas un ticket enregistré.');
  if (!isTicketStaff(interaction.member) && interaction.user.id !== ticket.userId) {
    return safeError(interaction, 'Seul l’auteur du ticket ou le staff peut le renommer.');
  }

  const raw = interaction.fields.getTextInputValue('ticket_new_name').trim();
  const slug = sanitizeName(raw.replace(/\s+/g, '-'));
  if (!slug) return safeError(interaction, 'Nom invalide.');
  const newName = `ticket-${slug}-${ticket.id}`.slice(0, 100);

  if (!(await safeDefer(interaction, EPHEMERAL))) return true;

  try {
    await interaction.channel.setName(newName, `Renommé par ${interaction.user.tag}`);
    updateTicket(interaction.channelId, { customName: newName });

    await log(interaction.client, 'tickets', 'rename', {
      guild: interaction.guild,
      fields: [
        { name: 'Ticket', value: `#${ticket.id} — <#${ticket.channelId}>`, inline: true },
        { name: 'Nouveau nom', value: newName, inline: true },
        { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });

    return safeReply(interaction, {
      embeds: [buildEmbed({ dark: true, title: 'Ticket renommé', description: `Le salon s'appelle maintenant **${newName}**.` })],
    });
  } catch (err) {
    console.error(`[alln-utils] rename ticket: ${err.stack ?? err.message}`);
    return safeReply(interaction, {
      embeds: [buildEmbed({ dark: true, title: 'Échec', description: 'Renommage impossible.' })],
    });
  }
}

async function addUserToTicket(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket) return safeError(interaction, 'Ce salon n’est pas un ticket.');
  if (!isTicketStaff(interaction.member)) return safeError(interaction, 'Réservé au staff.');

  const id = parseUserId(interaction.fields.getTextInputValue('ticket_add_user'));
  if (!id) return safeError(interaction, 'Identifiant utilisateur invalide.');
  if ((ticket.addedUsers ?? []).includes(id)) return safeError(interaction, 'Cet utilisateur est déjà dans le ticket.');

  if (!(await safeDefer(interaction, EPHEMERAL))) return true;

  try {
    await interaction.channel.permissionOverwrites.create(id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    updateTicket(interaction.channelId, { addedUsers: [...(ticket.addedUsers ?? []), id] });

    await log(interaction.client, 'tickets', 'addUser', {
      guild: interaction.guild,
      fields: [
        { name: 'Ticket', value: `#${ticket.id}`, inline: true },
        { name: 'Utilisateur', value: `<@${id}>`, inline: true },
        { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });

    return safeReply(interaction, {
      embeds: [buildEmbed({ dark: true, title: 'Utilisateur ajouté', description: `<@${id}> a été ajouté au ticket.` })],
    });
  } catch (err) {
    console.error(`[alln-utils] ticket add user: ${err.message}`);
    return safeReply(interaction, {
      embeds: [buildEmbed({ dark: true, title: 'Échec', description: 'Impossible d’ajouter l’utilisateur.' })],
    });
  }
}

async function removeUserFromTicket(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket) return safeError(interaction, 'Ce salon n’est pas un ticket.');
  if (!isTicketStaff(interaction.member)) return safeError(interaction, 'Réservé au staff.');

  const id = parseUserId(interaction.fields.getTextInputValue('ticket_remove_user'));
  if (!id) return safeError(interaction, 'Identifiant utilisateur invalide.');

  if (!(await safeDefer(interaction, EPHEMERAL))) return true;

  try {
    await interaction.channel.permissionOverwrites.delete(id);
    updateTicket(interaction.channelId, { addedUsers: (ticket.addedUsers ?? []).filter((u) => u !== id) });

    await log(interaction.client, 'tickets', 'removeUser', {
      guild: interaction.guild,
      fields: [
        { name: 'Ticket', value: `#${ticket.id}`, inline: true },
        { name: 'Utilisateur', value: `<@${id}>`, inline: true },
        { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });

    return safeReply(interaction, {
      embeds: [buildEmbed({ dark: true, title: 'Utilisateur retiré', description: `<@${id}> a été retiré du ticket.` })],
    });
  } catch (err) {
    console.error(`[alln-utils] ticket remove user: ${err.message}`);
    return safeReply(interaction, {
      embeds: [buildEmbed({ dark: true, title: 'Échec', description: 'Impossible de retirer l’utilisateur.' })],
    });
  }
}
