import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { getConfig } from '../config.js';
import {
  countOpenTicketsFor,
  getSuggestion,
  getTicketByChannel,
  nextTicketId,
  saveTicket,
  updateTicket,
} from '../db.js';
import { buildEmbed } from '../embeds.js';
import { handleWizardModal } from '../configWizard.js';
import { log } from '../logger.js';
import { isTicketStaff, replyError } from '../permissions.js';
import { buildTicketEmbed, buildTicketRow } from '../ticketUi.js';

function sanitizeName(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 20) || 'user';
}

export async function handleModal(interaction) {
  if (interaction.customId.startsWith('ticket_modal:')) return createTicket(interaction);
  if (interaction.customId.startsWith('ticket_form_modal:')) return createTicketFromForm(interaction);
  if (interaction.customId === 'ticket_rename_modal') return renameTicket(interaction);
  if (interaction.customId.startsWith('suggest_comment_modal:')) return commentSuggestion(interaction);
  if (interaction.customId.startsWith('cfgw_modal:')) return handleWizardModal(interaction);
  return null;
}

async function createTicketFromForm(interaction) {
  const category = interaction.customId.split(':')[1] ?? 'autre';
  const questions = getConfig().ticketForms?.[category] ?? [];
  const answers = questions.slice(0, 5).map((question, index) => {
    try {
      return interaction.fields.getTextInputValue(`tq_${index}`).trim();
    } catch {
      return '';
    }
  });

  const subject = answers[0]?.slice(0, 120) || `Ticket — ${category}`;
  const description = answers
    .map((answer, index) => (answer ? `**${questions[index]}**\n${answer}` : ''))
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 1000) || 'Aucune réponse fournie.';

  return createTicket(interaction, { subject, description });
}

async function createTicket(interaction, overrides = {}) {
  try {
    const category = interaction.customId.split(':')[1] ?? 'autre';
    const subject = overrides.subject ?? interaction.fields.getTextInputValue('ticket_subject').trim();
    const description = overrides.description ?? interaction.fields.getTextInputValue('ticket_description').trim();

    const config = getConfig();
    const guild = interaction.guild;
    const member = interaction.member;

    if (!config.ticketCategoryId) {
      return replyError(interaction, 'Aucune catégorie de tickets configurée. `/config set ticketCategoryId #catégorie`.');
    }

    const parent = await guild.channels.fetch(config.ticketCategoryId).catch(() => null);
    if (!parent || parent.type !== ChannelType.GuildCategory) {
      return replyError(interaction, 'La catégorie de tickets configurée est invalide.');
    }

    const open = countOpenTicketsFor(member.id);
    if (open >= config.ticketLimitPerUser) {
      return replyError(interaction, `Limite atteinte : ${open}/${config.ticketLimitPerUser} ticket(s) ouvert(s).`);
    }

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
      components: [buildTicketRow()],
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

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Ticket ouvert', description: `Ton ticket est prêt : <#${channel.id}>` })],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(`[alln-utils] création ticket: ${err.stack ?? err.message}`);
    return replyError(interaction, 'Création du ticket impossible. Vérifie les permissions du bot.');
  }
}

async function renameTicket(interaction) {
  try {
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket) return replyError(interaction, 'Ce salon n\'est pas un ticket enregistré.');
    if (!isTicketStaff(interaction.member) && interaction.user.id !== ticket.userId) {
      return replyError(interaction, 'Seul l\'auteur du ticket ou le staff peut le renommer.');
    }

    const raw = interaction.fields.getTextInputValue('ticket_new_name').trim();
    const slug = sanitizeName(raw.replace(/\s+/g, '-'));
    const newName = `ticket-${slug}-${ticket.id}`.slice(0, 100);

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

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Ticket renommé', description: `Le salon s'appelle maintenant **${newName}**.` })],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(`[alln-utils] rename ticket: ${err.stack ?? err.message}`);
    return replyError(interaction, 'Renommage impossible.');
  }
}

async function commentSuggestion(interaction) {
  try {
    const id = Number.parseInt(interaction.customId.split(':')[1], 10);
    const suggestion = getSuggestion(id);
    if (!suggestion) return replyError(interaction, 'Suggestion introuvable.');

    const text = interaction.fields.getTextInputValue('suggest_comment_text').trim();
    const config = getConfig();
    const channel = interaction.guild.channels.cache.get(config.suggestionsChannelId)
      ?? (await interaction.guild.channels.fetch(config.suggestionsChannelId).catch(() => null));

    if (!channel?.isTextBased()) return replyError(interaction, 'Salon de suggestions introuvable.');

    await channel.send({
      embeds: [buildEmbed({
        dark: true,
        title: `💬 Commentaire — suggestion #${id}`,
        description: text,
        fields: [
          { name: 'Auteur', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Suggestion', value: suggestion.text.slice(0, 500), inline: false },
        ],
      })],
    });

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Commentaire envoyé', description: 'Ton commentaire a été publié.' })],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(`[alln-utils] suggest comment: ${err.message}`);
    return replyError(interaction, 'Commentaire impossible.');
  }
}
