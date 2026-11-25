import { getConfig } from '../config.js';
import { getBumps, recordBump, setBumpReminder } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';

const BUMP_REMINDER_MS = 2 * 60 * 60 * 1000;
const MAX_TIMEOUT = 2_147_483_647;
const DISBOARD_ID = '302050872383242240';

let timer = null;

function isBumpMessage(message) {
  if (message.author?.id === DISBOARD_ID) return true;
  if (message.interaction?.commandName?.toLowerCase() === 'bump') return true;
  const content = String(message.content ?? '').toLowerCase();
  return content.includes('disboard.org') || (content.includes('bump') && content.includes('disboard'));
}

export async function handleBumpMessage(client, message) {
  if (!message.guild || !isBumpMessage(message)) return false;

  const bumper = message.interaction?.user ?? message.author;
  const config = getConfig();
  recordBump(bumper.id);

  const dueAt = new Date(Date.now() + BUMP_REMINDER_MS).toISOString();
  setBumpReminder(config.bumpAutoReminder ? dueAt : null);
  scheduleReminder(client);

  if (message.channel?.isTextBased()) {
    await message.channel.send({
      embeds: [buildEmbed({
        dark: true,
        title: 'Merci pour le bump !',
        description: `Merci <@${bumper.id}>. Prochain rappel <t:${Math.floor(new Date(dueAt).getTime() / 1000)}:R>.`,
      })],
    }).catch(() => null);
  }

  return true;
}

async function sendReminder(client) {
  const config = getConfig();
  if (!config.bumpsChannelId) return;
  const guild = client.guilds.cache.first();
  if (!guild) return;
  const channel = guild.channels.cache.get(config.bumpsChannelId)
    ?? (await guild.channels.fetch(config.bumpsChannelId).catch(() => null));
  if (!channel?.isTextBased()) return;

  await channel.send({
    embeds: [buildEmbed({
      dark: true,
      title: '⏰ C\'est l\'heure de bump !',
      description: 'Le délai de 2 heures est écoulé. Pense à bump le serveur.',
    })],
  }).catch(() => null);

  await log(client, 'bumps', 'reminder', {
    guild,
    fields: [
      { name: 'Salon', value: `<#${channel.id}>`, inline: true },
      { name: 'Prochain bump', value: 'rappel envoyé', inline: true },
    ],
  });

  setBumpReminder(null);
}

export function scheduleReminder(client) {
  if (timer) clearTimeout(timer);
  timer = null;

  const state = getBumps();
  if (!state.nextReminderAt) return;

  const delay = new Date(state.nextReminderAt).getTime() - Date.now();
  if (delay <= 0) {
    sendReminder(client).catch(() => null);
    return;
  }

  timer = setTimeout(() => {
    if (delay > MAX_TIMEOUT) {
      scheduleReminder(client);
      return;
    }
    sendReminder(client).catch((err) => console.error(`[alln-utils] bump reminder: ${err.message}`));
  }, Math.min(delay, MAX_TIMEOUT));
}

export function startBumpService(client) {
  scheduleReminder(client);
}

export function stopBumpService() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export function bumpLeaderboard(limit = 10) {
  return Object.entries(getBumps().counts)
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
