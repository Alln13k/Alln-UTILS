import { ChannelType } from 'discord.js';
import { getConfig } from '../config.js';
import { getStats, listGiveaways, listTickets } from '../db.js';

const UPDATE_MS = 5 * 60 * 1000;
let interval = null;

function desiredValues(guild) {
  return {
    statsMembersChannelId: `👥 Membres : ${guild.memberCount}`,
    statsGiveawaysChannelId: `🎁 Giveaways actifs : ${listGiveaways(true).length}`,
    statsTicketsChannelId: `🎫 Tickets ouverts : ${listTickets('open').length + listTickets('claimed').length}`,
    statsLeaksChannelId: `🔥 Leaks publiés : ${getStats().leaksPublished ?? 0}`,
  };
}

async function renameIfNeeded(guild, channelId, name) {
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId)
    ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) return;
  if (channel.name === name) return;
  await channel.setName(name, 'Stats channels').catch((err) => {
    console.error(`[alln-utils] stats channel ${channelId}: ${err.message}`);
  });
}

export async function updateStatsChannels(client) {
  const config = getConfig();
  for (const guild of client.guilds.cache.values()) {
    const values = desiredValues(guild);
    for (const [key, name] of Object.entries(values)) {
      await renameIfNeeded(guild, config[key], name);
    }
  }
}

export function startStatsService(client) {
  stopStatsService();
  updateStatsChannels(client).catch(() => null);
  interval = setInterval(() => {
    updateStatsChannels(client).catch((err) => console.error(`[alln-utils] stats channels: ${err.message}`));
  }, UPDATE_MS);
}

export function stopStatsService() {
  if (interval) clearInterval(interval);
  interval = null;
}
