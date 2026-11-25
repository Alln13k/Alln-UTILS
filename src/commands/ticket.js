import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getTicketByChannel, listTickets, updateTicket } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, isTicketStaff, replyError } from '../permissions.js';
import { performClose } from '../ticketClose.js';
import { refreshTicketPanel, PRIORITY_LABEL } from '../ticketUi.js';

const PER_PAGE = 5;

const PRIORITIES = Object.keys(PRIORITY_LABEL);

function sanitizeName(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'ticket';
}

function currentTicket(interaction) {
  return getTicketByChannel(interaction.channelId);
}

export default {
  category: 'Tickets',
  description: 'Gestion des tickets du salon courant',
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gestion des tickets du salon courant')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Ajoute un membre au ticket courant')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre à ajouter').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Retire un membre du ticket courant')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre à retirer').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('rename')
        .setDescription('Renomme le salon du ticket')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nouveau nom').setMaxLength(40).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('close')
        .setDescription('Ferme le ticket et génère un transcript')
        .addStringOption((opt) => opt.setName('raison').setDescription('Raison de la fermeture').setMaxLength(400).setRequired(false)),
    )
    .addSubcommand((sub) => sub.setName('claim').setDescription('Réserve le ticket pour toi (staff)'))
    .addSubcommand((sub) =>
      sub
        .setName('priority')
        .setDescription('Change la priorité du ticket')
        .addStringOption((opt) =>
          opt
            .setName('niveau')
            .setDescription('Priorité')
            .setRequired(true)
            .addChoices(
              { name: 'Basse', value: 'basse' },
              { name: 'Normale', value: 'normale' },
              { name: 'Haute', value: 'haute' },
            ),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les tickets ouverts (staff)')),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'list') return listTicketsCommand(interaction);

      const ticket = currentTicket(interaction);
      if (!ticket) return replyError(interaction, 'Ce salon n\'est pas un ticket enregistré.');

      if (sub === 'claim') return claimCommand(interaction, ticket);
      if (sub === 'add') return addMember(interaction, ticket);
      if (sub === 'remove') return removeMember(interaction, ticket);
      if (sub === 'rename') return renameCommand(interaction, ticket);
      if (sub === 'close') return closeCommand(interaction, ticket);
      if (sub === 'priority') return priorityCommand(interaction, ticket);

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action ticket impossible.', `/ticket ${interaction.options.getSubcommand?.() ?? ''}`);
    }
  },
};

async function addMember(interaction, ticket) {
  if (!isTicketStaff(interaction.member)) return replyError(interaction, 'Réservé au staff.');
  const user = interaction.options.getUser('membre', true);
  if (user.id === ticket.userId) return replyError(interaction, 'Cette personne est déjà l\'auteur du ticket.');
  if (user.bot) return replyError(interaction, 'Impossible d\'ajouter un bot.');

  await interaction.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
  });

  const added = Array.isArray(ticket.addedUsers) ? ticket.addedUsers : [];
  if (!added.includes(user.id)) added.push(user.id);
  updateTicket(ticket.channelId, { addedUsers: added });

  await log(interaction.client, 'tickets', 'addUser', {
    guild: interaction.guild,
    fields: [
      { name: 'Ticket', value: `#${ticket.id} — <#${ticket.channelId}>`, inline: true },
      { name: 'Membre', value: `<@${user.id}>`, inline: true },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return interaction.reply({
    embeds: [buildEmbed({ dark: true, title: 'Membre ajouté', description: `<@${user.id}> peut maintenant voir et répondre dans ce ticket.` })],
    flags: MessageFlags.Ephemeral,
  });
}

async function removeMember(interaction, ticket) {
  if (!isTicketStaff(interaction.member)) return replyError(interaction, 'Réservé au staff.');
  const user = interaction.options.getUser('membre', true);
  if (user.id === ticket.userId) return replyError(interaction, 'Impossible de retirer l\'auteur du ticket.');

  await interaction.channel.permissionOverwrites.delete(user.id).catch(() => null);

  const added = (Array.isArray(ticket.addedUsers) ? ticket.addedUsers : []).filter((id) => id !== user.id);
  updateTicket(ticket.channelId, { addedUsers: added });

  await log(interaction.client, 'tickets', 'removeUser', {
    guild: interaction.guild,
    fields: [
      { name: 'Ticket', value: `#${ticket.id} — <#${ticket.channelId}>`, inline: true },
      { name: 'Membre', value: `<@${user.id}>`, inline: true },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return interaction.reply({
    embeds: [buildEmbed({ dark: true, title: 'Membre retiré', description: `<@${user.id}> n'a plus accès à ce ticket.` })],
    flags: MessageFlags.Ephemeral,
  });
}

async function renameCommand(interaction, ticket) {
  if (!isTicketStaff(interaction.member) && interaction.user.id !== ticket.userId) {
    return replyError(interaction, 'Réservé à l\'auteur du ticket ou au staff.');
  }

  const raw = interaction.options.getString('nom', true);
  const newName = `ticket-${sanitizeName(raw)}-${ticket.id}`.slice(0, 100);

  await interaction.channel.setName(newName, `Renommé par ${interaction.user.tag}`);
  updateTicket(ticket.channelId, { customName: newName });

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
}

async function closeCommand(interaction, ticket) {
  if (!isTicketStaff(interaction.member) && interaction.user.id !== ticket.userId) {
    return replyError(interaction, 'Fermeture non autorisée.');
  }

  const reason = interaction.options.getString('raison') ?? 'Fermeture via /ticket close';

  await interaction.reply({
    embeds: [buildEmbed({ dark: true, title: 'Fermeture', description: 'Génération du transcript…' })],
    flags: MessageFlags.Ephemeral,
  });

  const result = await performClose(interaction, { reason });
  if (!result.ok) return replyError(interaction, result.error);

  return interaction.editReply({
    embeds: [buildEmbed({
      dark: true,
      title: `Ticket #${ticket.id} fermé`,
      description: result.transcriptSent ? 'Transcript envoyé. Le salon sera supprimé dans 10 secondes.' : 'Transcript non envoyé (salon de transcripts non configuré). Le salon sera supprimé dans 10 secondes.',
    })],
  }).catch(() => null);
}

async function claimCommand(interaction, ticket) {
  if (!isTicketStaff(interaction.member)) return replyError(interaction, 'Claim réservé au staff.');
  if (ticket.status === 'closed') return replyError(interaction, 'Ticket déjà fermé.');
  if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id) {
    return replyError(interaction, `Déjà pris en charge par <@${ticket.claimedBy}>.`);
  }

  const updated = updateTicket(ticket.channelId, { status: 'claimed', claimedBy: interaction.user.id });
  await refreshTicketPanel(interaction.guild, updated);

  await log(interaction.client, 'tickets', 'claim', {
    guild: interaction.guild,
    fields: [
      { name: 'Ticket', value: `#${ticket.id} — <#${ticket.channelId}>`, inline: true },
      { name: 'Staff', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return interaction.reply({
    embeds: [buildEmbed({ dark: true, title: 'Ticket claimed', description: `Ticket #${ticket.id} pris en charge par <@${interaction.user.id}>.` })],
    flags: MessageFlags.Ephemeral,
  });
}

async function priorityCommand(interaction, ticket) {
  if (!isTicketStaff(interaction.member)) return replyError(interaction, 'Réservé au staff.');

  const level = interaction.options.getString('niveau', true);
  if (!PRIORITIES.includes(level)) return replyError(interaction, 'Priorité invalide.');

  const updated = updateTicket(ticket.channelId, { priority: level });
  await refreshTicketPanel(interaction.guild, updated);

  await log(interaction.client, 'tickets', 'priority', {
    guild: interaction.guild,
    fields: [
      { name: 'Ticket', value: `#${ticket.id} — <#${ticket.channelId}>`, inline: true },
      { name: 'Priorité', value: PRIORITY_LABEL[level], inline: true },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return interaction.reply({
    embeds: [buildEmbed({ dark: true, title: 'Priorité mise à jour', description: `Ticket #${ticket.id} → ${PRIORITY_LABEL[level]}` })],
    flags: MessageFlags.Ephemeral,
  });
}

async function listTicketsCommand(interaction) {
  if (!isTicketStaff(interaction.member)) return replyError(interaction, 'Liste réservée au staff.');

  const open = listTickets('open').concat(listTickets('claimed'));
  const pages = Math.max(1, Math.ceil(open.length / PER_PAGE));
  const slice = open.slice(0, PER_PAGE);

  const description = slice.length
    ? slice.map((t) => `**#${t.id}** <#${t.channelId}> — <@${t.userId}> — ${t.status}${t.claimedBy ? ` (<@${t.claimedBy}>)` : ''}`).join('\n')
    : 'Aucun ticket ouvert.';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tickets_page:-1').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('tickets_page:1').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(pages <= 1),
  );

  return interaction.reply({
    embeds: [buildEmbed({ dark: true, title: `Tickets ouverts — page 1/${pages}`, description })],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}
