import { getConfig } from './config.js';
import { countWarns } from './db.js';
import { log } from './logger.js';

const MUTE_DURATION_MS = 60 * 60 * 1000;

export function nextWarnThreshold(count) {
  const config = getConfig();
  const thresholds = [
    { action: 'mute', at: Number(config.warnMuteAt) || 3 },
    { action: 'kick', at: Number(config.warnKickAt) || 5 },
    { action: 'ban', at: Number(config.warnBanAt) || 7 },
  ].filter((entry) => entry.at > count).sort((a, b) => a.at - b.at);

  return thresholds[0] ?? null;
}

export async function applyWarnThresholds(client, guild, member, { moderator = null, reason = 'Seuil de warns atteint' } = {}) {
  const config = getConfig();
  const count = countWarns(member.id);

  if (count === (Number(config.warnMuteAt) || 3)) {
    await member.timeout(MUTE_DURATION_MS, `Warns — ${reason}`).catch(() => null);
    await log(client, 'moderation', 'mute', {
      guild,
      title: 'Mute automatique — seuil de warns',
      fields: [
        { name: 'Cible', value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: 'Warns', value: String(count), inline: true },
        { name: 'Durée', value: '1 heure', inline: true },
        { name: 'Déclencheur', value: moderator ? `<@${moderator}>` : 'automod', inline: true },
      ],
    });
    return { action: 'mute', count };
  }

  if (count === (Number(config.warnKickAt) || 5)) {
    if (member.kickable) {
      await member.kick(`Warns — ${reason}`).catch(() => null);
      await log(client, 'moderation', 'kick', {
        guild,
        title: 'Kick automatique — seuil de warns',
        fields: [
          { name: 'Cible', value: `<@${member.id}> (${member.user.tag})`, inline: true },
          { name: 'Warns', value: String(count), inline: true },
          { name: 'Déclencheur', value: moderator ? `<@${moderator}>` : 'automod', inline: true },
        ],
      });
    }
    return { action: 'kick', count };
  }

  if (count === (Number(config.warnBanAt) || 7)) {
    await guild.members.ban(member.id, { reason: `Warns — ${reason}` }).catch(() => null);
    await log(client, 'moderation', 'ban', {
      guild,
      title: 'Ban automatique — seuil de warns',
      fields: [
        { name: 'Cible', value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: 'Warns', value: String(count), inline: true },
        { name: 'Déclencheur', value: moderator ? `<@${moderator}>` : 'automod', inline: true },
      ],
    });
    return { action: 'ban', count };
  }

  return { action: null, count };
}
