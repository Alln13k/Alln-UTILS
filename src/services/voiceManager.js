import { ChannelType } from 'discord.js';

/**
 * Rejoint un salon vocal via l'OP4 brut de la gateway.
 * Le bot est muté et sourd (self_mute/self_deaf) en permanence : aucun flux
 * audio n'est envoyé, aucune dépendance @discordjs/voice n'est nécessaire.
 */
function sendVoiceState(guild, channelId) {
  if (!guild?.shard) throw new Error('shard indisponible');
  return guild.shard.send({
    op: 4,
    d: {
      guild_id: guild.id,
      channel_id: channelId,
      self_mute: true,
      self_deaf: true,
    },
  });
}

export function currentVoiceChannelId(guild, userId = null) {
  if (!guild) return null;
  const member = userId ? guild.members.cache.get(userId) : guild.members.me;
  return member?.voice?.channelId ?? null;
}

export function isInChannel(guild, channelId, userId = null) {
  return Boolean(channelId) && currentVoiceChannelId(guild, userId) === channelId;
}

export async function joinChannel(guild, channelId) {
  if (!guild?.id || !channelId) return false;
  const channel = guild.channels.cache.get(channelId)
    ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  await sendVoiceState(guild, channel.id);
  return true;
}

export async function leaveChannel(guild) {
  if (!guild?.id) return false;
  if (!currentVoiceChannelId(guild)) return true;
  await sendVoiceState(guild, null);
  return true;
}

export async function ensureInChannel(guild, channelId) {
  if (!guild?.id || !channelId) return false;
  if (isInChannel(guild, channelId)) return true;
  return joinChannel(guild, channelId);
}
