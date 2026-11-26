import { AttachmentBuilder } from 'discord.js';
import { getConfig } from './config.js';
import { buildEmbed } from './embeds.js';
import { log } from './logger.js';
import { getTicketByChannel, updateTicket } from './db.js';

const MAX_MESSAGES = 1000;
const FETCH_BATCH = 100;

async function buildTranscript(channel, ticket) {
  const messages = [];
  let before;

  try {
    while (messages.length < MAX_MESSAGES) {
      const batch = await channel.messages.fetch({
        limit: Math.min(FETCH_BATCH, MAX_MESSAGES - messages.length),
        ...(before ? { before } : {}),
      });
      if (batch.size === 0) break;
      messages.push(...batch.values());
      before = batch.last()?.id;
      if (batch.size < FETCH_BATCH) break;
    }
  } catch (err) {
    console.error(`[alln-utils] transcript fetch #${ticket.id}: ${err.message}`);
  }

  messages.reverse();

  const header = [
    `Transcript du ticket #${ticket.id}`,
    `Sujet : ${ticket.subject ?? 'Sans sujet'}`,
    `Catégorie : ${ticket.category ?? 'autre'}`,
    `Auteur : ${ticket.username ?? ticket.userId}`,
    `Statut : ${ticket.status}`,
    `Créé : ${ticket.createdAt ?? 'inconnu'}`,
    `Fermé : ${ticket.closedAt ?? 'inconnu'}`,
    `Fermé par : ${ticket.closedBy ?? 'système'}`,
    `Raison : ${ticket.closeReason ?? 'Aucune'}`,
    '='.repeat(70),
    '',
  ];

  const lines = messages.map((message) => {
    const author = message.author?.tag ?? 'Inconnu';
    const content = message.content?.trim() || '[embed/pièce jointe]';
    const attachments = [...message.attachments.values()].map((attachment) => attachment.url);
    const embeds = message.embeds
      .map((embed) => [embed.title, embed.description].filter(Boolean).join(' — '))
      .filter(Boolean);

    return [
      `[${message.createdAt?.toISOString() ?? 'date inconnue'}] ${author} (${message.author?.id ?? '?'})`,
      content,
      ...attachments.map((url) => `Pièce jointe : ${url}`),
      ...embeds.map((text) => `Embed : ${text}`),
      '',
    ].join('\n');
  });

  return `${header.join('\n')}\n${lines.join('\n')}`.slice(0, 5_000_000);
}

async function sendTranscript(client, guild, ticket, content) {
  const config = getConfig();
  if (!config.ticketTranscriptChannelId) return false;

  try {
    const channel = await guild.channels.fetch(config.ticketTranscriptChannelId).catch(() => null);
    if (!channel?.isTextBased()) return false;

    const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
      name: `ticket-${ticket.id}.txt`,
    });

    const message = await channel.send({
      embeds: [buildEmbed({
        dark: true,
        title: `Transcript ticket #${ticket.id}`,
        fields: [
          { name: 'Auteur', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Catégorie', value: String(ticket.category ?? 'autre'), inline: true },
          { name: 'Messages', value: String(content.split('\n').length), inline: true },
        ],
      })],
      files: [file],
    });

    await log(client, 'tickets', 'transcript', {
      guild,
      fields: [
        { name: 'Ticket', value: `#${ticket.id} — <#${ticket.channelId}>`, inline: true },
        { name: 'Transcript', value: `[Ouvrir](${message.url})`, inline: true },
      ],
    }).catch(() => null);

    return true;
  } catch (err) {
    console.error(`[alln-utils] transcript send #${ticket.id}: ${err.message}`);
    return false;
  }
}

export async function closeTicketChannel(client, channel, { closedBy = null, reason = 'Aucune raison' } = {}) {
  if (!channel?.id || !channel.guild) return { ok: false, error: 'Salon invalide.' };

  const ticket = getTicketByChannel(channel.id);
  if (!ticket) return { ok: false, error: 'Ce salon n’est pas un ticket enregistré.' };
  if (ticket.status === 'closed') return { ok: false, error: 'Ce ticket est déjà fermé.' };

  const updated = updateTicket(channel.id, {
    status: 'closed',
    closedAt: new Date().toISOString(),
    closedBy,
    closeReason: reason,
  });

  if (!updated) return { ok: false, error: 'Impossible de mettre à jour le ticket.' };

  const transcript = await buildTranscript(channel, updated).catch(() => null);
  const transcriptSent = transcript ? await sendTranscript(client, channel.guild, updated, transcript) : false;

  await log(client, 'tickets', 'close', {
    guild: channel.guild,
    fields: [
      { name: 'Ticket', value: `#${updated.id} — <#${updated.channelId}>`, inline: true },
      { name: 'Fermé par', value: closedBy ? `<@${closedBy}>` : 'système', inline: true },
      { name: 'Raison', value: String(reason).slice(0, 1000), inline: false },
      { name: 'Transcript', value: transcriptSent ? 'envoyé' : 'non envoyé', inline: true },
    ],
  }).catch(() => null);

  await channel.send({
    embeds: [buildEmbed({
      dark: true,
      title: 'Ticket fermé',
      description: `Fermé par ${closedBy ? `<@${closedBy}>` : 'le système'}.\nRaison : ${String(reason).slice(0, 1500)}`,
    })],
  }).catch(() => null);

  const timer = setTimeout(async () => {
    try {
      await channel.delete(`Ticket #${updated.id} fermé`);
    } catch (err) {
      console.error(`[alln-utils] suppression ticket #${updated.id}: ${err.message}`);
      await channel.permissionOverwrites
        .edit(channel.guild.roles.everyone, { SendMessages: false })
        .catch(() => null);
      await channel.setName(`closed-${updated.id}`).catch(() => null);
    }
  }, 5000);
  timer.unref?.();

  return { ok: true, ticket: updated, transcriptSent };
}

export async function performClose(interaction, { reason = 'Aucune raison' } = {}) {
  return closeTicketChannel(interaction.client, interaction.channel, {
    closedBy: interaction.user.id,
    reason,
  });
}
