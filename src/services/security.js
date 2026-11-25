import { getConfig } from '../config.js';
import { getSecurityState, saveSecurityState } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { isStaff } from '../permissions.js';
import { enableRaidMode, isLockable } from '../raidMode.js';

const LINK_PATTERN = /(https?:\/\/|www\.)/i;

export function pruneJoinTimes(windowSeconds = 300) {
  const state = getSecurityState();
  const cutoff = Date.now() - windowSeconds * 1000;
  const next = state.joinTimes.filter((timestamp) => timestamp >= cutoff);
  saveSecurityState({ joinTimes: next });
  return next;
}

export async function handleSecurityJoin(client, member) {
  const config = getConfig();
  const windowSeconds = Math.max(2, Number(config.securityJoinRateWindow) || 10);
  const limit = Math.max(2, Number(config.securityJoinRateCount) || 10);
  const now = Date.now();

  const state = getSecurityState();
  const recent = [...state.joinTimes, now].filter((timestamp) => now - timestamp <= windowSeconds * 1000);
  saveSecurityState({ joinTimes: recent });

  if (recent.length < limit) return { triggered: false, count: recent.length };

  if (!config.raidModeEnabled) {
    const configured = config.raidModeLockedChannels ?? [];
    const targets = configured.length > 0
      ? configured
      : member.guild.channels.cache.filter(isLockable).map((channel) => channel.id);
    await enableRaidMode(client, member.guild, { auto: true, channelIds: targets });
  }

  await log(client, 'security', 'joinRateAlert', {
    guild: member.guild,
    description: `${recent.length} arrivées en ${windowSeconds} secondes — raid mode activé automatiquement.`,
    fields: [
      { name: 'Dernier membre', value: `<@${member.id}> (${member.user.tag})`, inline: true },
      { name: 'Seuil', value: `${limit} / ${windowSeconds}s`, inline: true },
      { name: 'Compte créé', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
    ],
  });

  const owner = await client.users.fetch(member.guild.ownerId).catch(() => null);
  if (owner) {
    await owner.send({
      embeds: [buildEmbed({
        dark: true,
        title: 'Alerte raid — Alln UTILS',
        description: `Joins massifs détectés sur **${member.guild.name}**. Raid mode activé automatiquement.`,
        fields: [
          { name: 'Arrivées', value: `${recent.length} en ${windowSeconds}s`, inline: true },
          { name: 'Seuil', value: String(limit), inline: true },
        ],
      })],
    }).catch(() => null);
  }

  return { triggered: true, count: recent.length };
}

export async function handleNewAccountLink(client, message) {
  if (!message.guild || message.author?.bot) return false;
  if (!LINK_PATTERN.test(message.content ?? '')) return false;

  const config = getConfig();
  const member = message.member
    ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return false;
  if (isStaff(member)) return false;
  if ((config.automodImmuneRoles ?? []).some((roleId) => member.roles.cache.has(roleId))) return false;

  const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  const threshold = Number(config.securityNewAccountDays) || 7;
  if (ageDays >= threshold) return false;

  await message.delete().catch(() => null);

  const action = String(config.securityRaidAction ?? 'kick').toLowerCase() === 'ban' ? 'ban' : 'kick';
  let result = 'ok';
  try {
    if (action === 'ban') await message.guild.members.ban(member.id, { reason: 'Compte récent — lien externe' });
    else await member.kick('Compte récent — lien externe');
  } catch (err) {
    result = `échec: ${err.message}`;
  }

  await log(client, 'security', 'newAccountKick', {
    guild: message.guild,
    description: `Compte de moins de ${threshold} jour(s) ayant posté un lien externe.`,
    fields: [
      { name: 'Auteur', value: `<@${member.id}> (${member.user.tag})`, inline: true },
      { name: 'ID', value: member.id, inline: true },
      { name: 'Âge du compte', value: `${ageDays.toFixed(1)} jour(s)`, inline: true },
      { name: 'Action', value: `${action} — ${result}`, inline: true },
      { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
      { name: 'Contenu', value: (message.content || '[embed]').slice(0, 200), inline: false },
      { name: 'Horodatage', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
    ],
  });

  return true;
}

export function securityStatus() {
  const config = getConfig();
  return {
    raidModeEnabled: Boolean(config.raidModeEnabled),
    joinRate: `${config.securityJoinRateCount} joins / ${config.securityJoinRateWindow}s`,
    newAccountDays: config.securityNewAccountDays,
    raidAction: config.securityRaidAction,
    automod: Boolean(config.automodEnabled),
    raidTrap: Boolean(config.raidTrapEnabled),
    lockedChannels: (config.raidModeLockedChannels ?? []).length,
  };
}
