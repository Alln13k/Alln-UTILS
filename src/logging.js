import { buildDark } from './embeds.js';

export async function logTo(guild, channelId, payload) {
  if (!guild || !channelId) return null;
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return null;
    return await channel.send(payload);
  } catch (err) {
    console.error(`[alln-utils] envoi vers ${channelId} échoué: ${err.message}`);
    return null;
  }
}

export async function sendToChannel(guild, channelId, payload) {
  return logTo(guild, channelId, payload);
}

export { buildDark };
