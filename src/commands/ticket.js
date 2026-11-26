import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed, buildError } from '../embeds.js';
import { log } from '../logger.js';
import { isTicketStaff, requireAdmin } from '../permissions.js';
import { safeDefer, safeReply } from '../respond.js';
import { getTicketByChannel, listTickets, updateTicket } from '../db.js';
import { closeTicketChannel } from '../ticketClose.js';

function sanitizeName(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 20) || 'user';
}

export default {
  category: 'Tickets',
  description: 'Gère un ticket',
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gère un ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les tickets ouverts'))
    .addSubcommand((sub) =>
      sub
        .setName('claim')
        .setDescription('Prend un ticket en charge')
        .addChannelOption((opt) => opt.setName('salon').setDescription('Salon du ticket').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('close')
        .setDescription('Ferme un ticket')
        .addStringOption((opt) => opt.setName('raison').setDescription('Raison de la fermeture').setRequired(false))
        .addChannelOption((opt) => opt.setName('salon').setDescription('Salon du ticket').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('rename')
        .setDescription('Renomme un ticket')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nouveau nom').setRequired(true))
        .addChannelOption((opt) => opt.setName('salon').setDescription('Salon du ticket').setRequired(false)),
    ),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const open = [...listTickets('open'), ...listTickets('claimed')];
      const description = open.length
        ? open.map((ticket) =>
          `**#${ticket.id}** <#${ticket.channelId}> — <@${ticket.userId}> — ${ticket.status}`).join('\n')
        : 'Aucun ticket ouvert.';
      return safeReply(interaction, {
        embeds: [buildEmbed({ dark: true, title: 'Tickets ouverts', description })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    const ticket = getTicketByChannel(channel.id);
    if (!ticket) {
      return safeReply(interaction, {
        embeds: [buildError('Ce salon n’est pas un ticket.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'claim') {
      if (!isTicketStaff(interaction.member)) {
        return safeReply(interaction, { embeds: [buildError('Réservé au staff.')], flags: MessageFlags.Ephemeral });
      }
      if (ticket.status === 'closed') {
        return safeReply(interaction, { embeds: [buildError('Ticket déjà fermé.')], flags: MessageFlags.Ephemeral });
      }
      if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id) {
        return safeReply(interaction, { embeds: [buildError(`Déjà pris par <@${ticket.claimedBy}>.`)], flags: MessageFlags.Ephemeral });
      }

      if (!(await safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
      updateTicket(channel.id, { status: 'claimed', claimedBy: interaction.user.id });
      await log(interaction.client, 'tickets', 'claim', {
        guild: interaction.guild,
        fields: [
          { name: 'Ticket', value: `#${ticket.id}`, inline: true },
          { name: 'Staff', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });
      return safeReply(interaction, {
        embeds: [buildEmbed({ dark: true, title: 'Claim', description: `Ticket #${ticket.id} pris en charge.` })],
      });
    }

    if (sub === 'close') {
      if (!isTicketStaff(interaction.member) && interaction.user.id !== ticket.userId) {
        return safeReply(interaction, { embeds: [buildError('Réservé à l’auteur ou au staff.')], flags: MessageFlags.Ephemeral });
      }
      const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';
      if (!(await safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;

      const result = await closeTicketChannel(interaction.client, channel, {
        closedBy: interaction.user.id,
        reason,
      });
      return safeReply(interaction, {
        embeds: [buildEmbed({
          dark: true,
          title: result.ok ? 'Fermé' : 'Échec',
          description: result.ok
            ? `Ticket #${ticket.id} fermé. Transcript ${result.transcriptSent ? 'envoyé' : 'indisponible'}.`
            : result.error,
        })],
      });
    }

    if (!isTicketStaff(interaction.member) && interaction.user.id !== ticket.userId) {
      return safeReply(interaction, { embeds: [buildError('Réservé à l’auteur ou au staff.')], flags: MessageFlags.Ephemeral });
    }

    const slug = sanitizeName(interaction.options.getString('nom', true));
    const newName = `ticket-${slug}-${ticket.id}`.slice(0, 100);
    if (!(await safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;

    try {
      await channel.setName(newName, `Renommé par ${interaction.user.tag}`);
      updateTicket(channel.id, { customName: newName });
      await log(interaction.client, 'tickets', 'rename', {
        guild: interaction.guild,
        fields: [
          { name: 'Ticket', value: `#${ticket.id}`, inline: true },
          { name: 'Nouveau nom', value: newName, inline: true },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });
      return safeReply(interaction, {
        embeds: [buildEmbed({ dark: true, title: 'Renommé', description: `Le salon s'appelle maintenant **${newName}**.` })],
      });
    } catch (err) {
      console.error(`[alln-utils] ticket rename: ${err.message}`);
      return safeReply(interaction, {
        embeds: [buildEmbed({ dark: true, title: 'Échec', description: 'Renommage impossible.' })],
      });
    }
  },
};
