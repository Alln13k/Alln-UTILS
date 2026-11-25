import { listScheduleItems, updateScheduleItem } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';

const CHECK_MS = 30_000;
let interval = null;
let running = false;

function firstGuild(client, guildId) {
  return client.guilds.cache.get(guildId) ?? client.guilds.cache.first() ?? null;
}

async function processDue(client) {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    for (const item of listScheduleItems()) {
      if (item.sent) continue;
      if (new Date(item.dueAt).getTime() > now) continue;

      const guild = firstGuild(client, item.guildId);
      if (!guild) continue;
      const channel = guild.channels.cache.get(item.channelId)
        ?? (await guild.channels.fetch(item.channelId).catch(() => null));

      if (!channel?.isTextBased()) {
        updateScheduleItem(item.id, { sent: true, sentAt: new Date().toISOString(), error: 'salon introuvable' });
        continue;
      }

      const payload = item.embed
        ? { embeds: [buildEmbed({ dark: true, title: item.title || 'Message planifié', description: item.content })] }
        : { content: item.content };

      const message = await channel.send(payload).catch(() => null);
      updateScheduleItem(item.id, {
        sent: true,
        sentAt: new Date().toISOString(),
        messageId: message?.id ?? null,
      });

      await log(client, 'schedule', 'send', {
        guild,
        fields: [
          { name: 'Salon', value: `<#${item.channelId}>`, inline: true },
          { name: 'ID', value: `#${item.id}`, inline: true },
          { name: 'Auteur', value: `<@${item.userId}>`, inline: true },
          { name: 'Contenu', value: String(item.content).slice(0, 500), inline: false },
        ],
      });
    }
  } finally {
    running = false;
  }
}

export function startScheduleService(client) {
  stopScheduleService();
  processDue(client).catch(() => null);
  interval = setInterval(() => {
    processDue(client).catch((err) => console.error(`[alln-utils] schedule: ${err.message}`));
  }, CHECK_MS);
}

export function stopScheduleService() {
  if (interval) clearInterval(interval);
  interval = null;
}
