import { getConfig } from './config.js';
import { countWarns } from './db.js';
import { log } from './logger.js';

const MUTE_DURATION_MS = 60 * 60 * 1000;

function thresholds() {
  const config = getConfig();
  const values = config.warnThresholds ?? {};
  return {
    mute: Math.max(1, Number(values.mute) || 3),
    kick: Math.max(1, Number(values.kick) || 5),
    ban: Math.max(1, Number(values.ban) || 7),
  };
}

export async function applyWarnThresholds(client, guild, member, { moderator = null, reason = 'Seuil de warns atteint' } = {}) {
  if (!member?.id) return { action: null, count: 0 };

  const config = thresholds();
  const count = countWarns(member.id);
  const by = moderator ? `<@${moderator}>` : 'automod';

  if (count === config.mute) {
    await member.timeout(MUTE_DURATION_MS, `Warns — ${reason}`).catch(() => null);
    await log(client, 'moderation', 'mute', {
      guild,
      title: 'Mute automatique — seuil de warns',
      fields: [
        { name: 'Cible', value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: 'Warns', value: String(count), inline: true },
        { name: 'Durée', value: '1 heure', inline: true },
        { name: 'Déclencheur', value: by, inline: true },
      ],
    });
    return { action: 'mute', count };
  }

  if (count === config.kick) {
    if (member.kickable) {
      await member.kick(`Warns — ${reason}`).catch(() => null);
      await log(client, 'moderation', 'kick', {
        guild,
        title: 'Kick automatique — seuil de warns',
        fields: [
          { name: 'Cible', value: `<@${member.id}> (${member.user.tag})`, inline: true },
          { name: 'Warns', value: String(count), inline: true },
          { name: 'Déclencheur', value: by, inline: true },
        ],
      });
      return { action: 'kick', count };
    }
    return { action: 'kick-denied', count };
  }

  if (count === config.ban) {
    await guild.members.ban(member.id, { reason: `Warns — ${reason}` }).catch(() => null);
    await log(client, 'moderation', 'ban', {
      guild,
      title: 'Ban automatique — seuil de warns',
      fields: [
        { name: 'Cible', value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: 'Warns', value: String(count), inline: true },
        { name: 'Déclencheur', value: by, inline: true },
      ],
    });
    return { action: 'ban', count };
  }

  return { action: null, count };
}
