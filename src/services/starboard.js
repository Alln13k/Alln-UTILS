import { getConfig } from '../config.js';
import { deleteStarboardEntry, getStarboardEntry, saveStarboardEntry } from '../db.js';
import { buildEmbed } from '../embeds.js';

function matchesEmoji(reaction, emoji) {
  if (!emoji) return false;
  return reaction.emoji?.name === emoji
    || reaction.emoji?.toString() === emoji
    || (reaction.emoji?.id && emoji.includes(reaction.emoji.id));
}

function buildStarboardEmbed(message, count) {
  const firstImage = message.attachments.find((attachment) => attachment.contentType?.startsWith('image/'));
  const embedImage = message.embeds.find((embed) => embed.image?.url)?.image?.url;

  return buildEmbed({
    dark: true,
    title: '⭐ Starboard',
    description: (message.content || '[embed ou pièce jointe]').slice(0, 1500),
    image: firstImage?.url ?? embedImage ?? null,
    fields: [
      { name: 'Auteur', value: `<@${message.author.id}>`, inline: true },
      { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
      { name: 'Étoiles', value: String(count), inline: true },
      { name: 'Message', value: `[aller au message](${message.url})`, inline: false },
    ],
  });
}

async function fetchStarboardChannel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId)
    ?? (await guild.channels.fetch(channelId).catch(() => null));
  return channel?.isTextBased() ? channel : null;
}

export async function handleStarboardAdd(client, reaction, user) {
  try {
    const config = getConfig();
    if (!config.starboardChannelId) return;
    if (user?.bot) return;

    if (reaction.partial) await reaction.fetch().catch(() => null);
    if (reaction.message.partial) await reaction.message.fetch().catch(() => null);

    const message = reaction.message;
    if (!message.guild || message.channelId === config.starboardChannelId) return;
    if (!matchesEmoji(reaction, config.starboardEmoji)) return;

    const count = reaction.count ?? 0;
    if (count < (config.starboardThreshold ?? 3)) return;

    const channel = await fetchStarboardChannel(message.guild, config.starboardChannelId);
    if (!channel) return;

    const existing = getStarboardEntry(message.id);
    if (existing) {
      const starMessage = await channel.messages.fetch(existing.starboardMessageId).catch(() => null);
      if (starMessage) {
        await starMessage.edit({ embeds: [buildStarboardEmbed(message, count)] }).catch(() => null);
        saveStarboardEntry(message.id, { ...existing, count });
      }
      return;
    }

    const sent = await channel.send({ embeds: [buildStarboardEmbed(message, count)] }).catch(() => null);
    if (!sent) return;

    saveStarboardEntry(message.id, {
      messageId: message.id,
      starboardMessageId: sent.id,
      channelId: message.channelId,
      guildId: message.guild.id,
      authorId: message.author.id,
      count,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[alln-utils] starboard add: ${err.message}`);
  }
}

export async function handleStarboardRemove(client, reaction, user) {
  try {
    const config = getConfig();
    if (!config.starboardChannelId) return;
    if (user?.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => null);

    const message = reaction.message;
    if (!matchesEmoji(reaction, config.starboardEmoji)) return;

    const entry = getStarboardEntry(message.id);
    if (!entry) return;

    const count = reaction.count ?? 0;
    if (count >= (config.starboardThreshold ?? 3)) {
      const channel = await fetchStarboardChannel(message.guild, config.starboardChannelId);
      const starMessage = await channel?.messages.fetch(entry.starboardMessageId).catch(() => null);
      if (starMessage) {
        await starMessage.edit({ embeds: [buildStarboardEmbed(message, count)] }).catch(() => null);
        saveStarboardEntry(message.id, { ...entry, count });
      }
      return;
    }

    const channel = await fetchStarboardChannel(message.guild, config.starboardChannelId);
    const starMessage = await channel?.messages.fetch(entry.starboardMessageId).catch(() => null);
    if (starMessage) await starMessage.delete().catch(() => null);
    deleteStarboardEntry(message.id);
  } catch (err) {
    console.error(`[alln-utils] starboard remove: ${err.message}`);
  }
}
