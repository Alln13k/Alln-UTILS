import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildEmbed } from './embeds.js';

const PRIORITY_LABEL = {
  basse: '🟢 Basse',
  normale: '🟡 Normale',
  haute: '🔴 Haute',
};

export function buildTicketEmbed(ticket) {
  const statusLabel = ticket.status === 'claimed'
    ? `Pris en charge par <@${ticket.claimedBy}>`
    : ticket.status === 'closed'
      ? 'Fermé'
      : 'Ouvert';

  return buildEmbed({
    dark: true,
    title: `Ticket #${ticket.id} — ${ticket.category}`,
    description: ticket.description ? ticket.description.slice(0, 1500) : null,
    fields: [
      { name: 'Auteur', value: `<@${ticket.userId}>`, inline: true },
      { name: 'Sujet', value: ticket.subject.slice(0, 200), inline: true },
      { name: 'Priorité', value: PRIORITY_LABEL[ticket.priority] ?? PRIORITY_LABEL.normale, inline: true },
      { name: 'Statut', value: statusLabel, inline: true },
      { name: 'Créé', value: `<t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:R>`, inline: true },
      { name: 'Messages', value: String(ticket.messageCount ?? 0), inline: true },
    ],
  });
}

export function buildTicketRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_rename').setLabel('Rename').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger),
  );
}

export async function refreshTicketPanel(guild, ticket) {
  if (!ticket.panelMessageId) return null;
  try {
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel?.isTextBased()) return null;
    const message = await channel.messages.fetch(ticket.panelMessageId).catch(() => null);
    if (!message) return null;
    return await message.edit({ embeds: [buildTicketEmbed(ticket)], components: [buildTicketRow()] });
  } catch (err) {
    console.error(`[alln-utils] refresh ticket échoué: ${err.message}`);
    return null;
  }
}

export { PRIORITY_LABEL };
