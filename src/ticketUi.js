import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildEmbed } from './embeds.js';

const STATUS_LABELS = {
  open: '🟢 Ouvert',
  claimed: '🟡 Pris en charge',
  closed: '🔴 Fermé',
};

function timestamp(value) {
  const date = new Date(value ?? 0);
  if (Number.isNaN(date.getTime())) return 'inconnu';
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

export function buildTicketEmbed(ticket) {
  const fields = [
    { name: 'Statut', value: STATUS_LABELS[ticket.status] ?? ticket.status, inline: true },
    { name: 'Auteur', value: `<@${ticket.userId}>`, inline: true },
    { name: 'Claim par', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Aucun', inline: true },
    { name: 'Créé', value: timestamp(ticket.createdAt), inline: true },
  ];

  if (ticket.closedAt) {
    fields.push({ name: 'Fermé', value: timestamp(ticket.closedAt), inline: true });
    fields.push({ name: 'Raison', value: String(ticket.closeReason ?? 'Aucune').slice(0, 1000), inline: false });
  }

  return buildEmbed({
    dark: true,
    title: `Ticket #${ticket.id} — ${ticket.category}`,
    description: String(ticket.subject ?? 'Sans sujet').slice(0, 4000),
    fields,
  });
}

export function buildTicketRow(ticket = null) {
  const disabled = ticket?.status === 'closed';

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel('Prendre en charge')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Fermer')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('ticket_rename')
      .setLabel('Renommer')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('ticket_add')
      .setLabel('Ajouter')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('ticket_remove')
      .setLabel('Retirer')
      .setEmoji('➖')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}
