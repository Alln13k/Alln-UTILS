import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

export function sanitizeName(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 20) || 'user';
}

export function parseUserId(raw) {
  const value = String(raw ?? '').trim();
  const mention = value.match(/^<@!?(\d+)>$/);
  if (mention) return mention[1];
  return /^\d{15,25}$/.test(value) ? value : null;
}

export function buildTicketModal(category) {
  const safeCategory = String(category || 'autre').slice(0, 20);

  return new ModalBuilder()
    .setCustomId(`ticket_modal:${safeCategory}`)
    .setTitle(`Ticket — ${safeCategory}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket_subject')
          .setLabel('Sujet')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(120)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket_description')
          .setLabel('Description courte')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true),
      ),
    );
}
