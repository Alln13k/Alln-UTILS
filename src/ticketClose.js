import { AttachmentBuilder } from 'discord.js';
import { getConfig } from './config.js';
import { getTicketByChannel, updateTicket } from './db.js';
import { buildEmbed } from './embeds.js';
import { log } from './logger.js';
import { createTranscript } from './transcript.js';

export async function performClose(interaction, { reason = 'Fermeture manuelle', delayMs = 10_000 } = {}) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket) return { ok: false, error: 'Ce salon n\'est pas un ticket enregistré.' };
  if (ticket.status === 'closed') return { ok: false, error: 'Ticket déjà fermé.' };

  const closed = updateTicket(interaction.channelId, {
    status: 'closed',
    closedAt: new Date().toISOString(),
    closedBy: interaction.user.id,
    closeReason: reason,
  });

  const config = getConfig();
  const { name, buffer } = await createTranscript(interaction.channel, closed);

  const transcriptChannel = config.ticketTranscriptChannelId
    ? await interaction.guild.channels.fetch(config.ticketTranscriptChannelId).catch(() => null)
    : null;

  if (transcriptChannel?.isTextBased()) {
    const message = await transcriptChannel.send({
      embeds: [buildEmbed({
        dark: true,
        title: `Transcript — Ticket #${ticket.id}`,
        fields: [
          { name: 'Auteur', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Fermé par', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Raison', value: reason.slice(0, 500), inline: true },
          { name: 'Messages', value: String(closed.messageCount ?? 0), inline: true },
        ],
      })],
      files: [new AttachmentBuilder(buffer, { name })],
    }).catch(() => null);

    await log(interaction.client, 'tickets', 'transcript', {
      guild: interaction.guild,
      fields: [
        { name: 'Ticket', value: `#${ticket.id} — <#${ticket.channelId}>`, inline: true },
        { name: 'Fichier', value: name, inline: true },
        { name: 'Message', value: message ? message.id : 'échec d\'envoi', inline: true },
      ],
    });
  }

  await log(interaction.client, 'tickets', 'close', {
    guild: interaction.guild,
    fields: [
      { name: 'Ticket', value: `#${ticket.id} — <#${ticket.channelId}>`, inline: true },
      { name: 'Fermé par', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Raison', value: reason.slice(0, 500), inline: false },
    ],
  });

  const channel = interaction.channel;
  setTimeout(() => {
    channel.delete(`Ticket #${ticket.id} fermé`).catch((err) => {
      console.error(`[alln-utils] suppression ticket: ${err.message}`);
    });
  }, delayMs);

  return { ok: true, ticket: closed, transcriptSent: Boolean(transcriptChannel) };
}
