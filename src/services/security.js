import { getConfig } from '../config.js';
import { getSecurityState, saveSecurityState } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { isStaff } from '../permissions.js';
import { enableRaidMode, isLockable } from '../raidmode.js';

const LINK_PATTERN = /(https?:\/\/|www\.)/i;
const INVITE_PATTERN = /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i;

function securitySettings() {
  const config = getConfig();
  return {
    raidModeEnabled: Boolean(config.raidModeEnabled),
    joinWindow: Math.max(2, Number(config.securityJoinRateWindow) || 10),
    joinLimit: Math.max(2, Number(config.securityJoinRateCount) || 10),
    newAccountDays: Math.max(1, Number(config.securityNewAccountDays) || 7),
    raidAction: String(config.securityRaidAction ?? 'kick').toLowerCase() === 'ban' ? 'ban' : 'kick',
    lockedChannels: config.raidModeLockedChannels ?? [],
  };
}

export function pruneJoinTimes(windowSeconds = 300) {
  const state = getSecurityState();
  const cutoff = Date.now() - windowSeconds * 1000;
  const next = state.joinTimes.filter((timestamp) => timestamp >= cutoff);
  saveSecurityState({ joinTimes: next });
  return next;
}

export async function handleSecurityJoin(client, member) {
  const settings = securitySettings();
  const now = Date.now();
  const state = getSecurityState();
  const recent = [...state.joinTimes, now].filter((timestamp) => now - timestamp <= settings.joinWindow * 1000);
  saveSecurityState({ joinTimes: recent });

  if (recent.length < settings.joinLimit) return { triggered: false, count: recent.length };

  if (!settings.raidModeEnabled) {
    const targets = settings.lockedChannels.length > 0
      ? settings.lockedChannels
      : member.guild.channels.cache.filter(isLockable).map((channel) => channel.id);
    await enableRaidMode(client, member.guild, { auto: true, channelIds: targets });
  }

  await log(client, 'security', 'joinRateAlert', {
    guild: member.guild,
    description: `${recent.length} arrivées en ${settings.joinWindow} secondes — raid mode activé automatiquement.`,
    fields: [
      { name: 'Dernier membre', value: `<@${member.id}> (${member.user.tag})`, inline: true },
      { name: 'Seuil', value: `${settings.joinLimit} / ${settings.joinWindow}s`, inline: true },
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
          { name: 'Arrivées', value: `${recent.length} en ${settings.joinWindow}s`, inline: true },
          { name: 'Seuil', value: String(settings.joinLimit), inline: true },
        ],
      })],
    }).catch(() => null);
  }

  return { triggered: true, count: recent.length };
}

export async function handleNewAccountLink(client, message) {
  if (!message.guild || message.author?.bot || message.deleted) return false;
  if (!(LINK_PATTERN.test(message.content ?? '') || INVITE_PATTERN.test(message.content ?? ''))) return false;

  const settings = securitySettings();
  const member = message.member
    ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member || isStaff(member)) return false;

  const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  if (ageDays >= settings.newAccountDays) return false;

  await message.delete().catch(() => null);

  let result = 'ok';
  try {
    if (settings.raidAction === 'ban') {
      await message.guild.members.ban(member.id, { reason: 'Compte récent — lien externe' });
    } else {
      await member.kick('Compte récent — lien externe');
    }
  } catch (err) {
    result = `échec: ${err.message}`;
  }

  await log(client, 'security', 'newAccountKick', {
    guild: message.guild,
    description: `Compte de moins de ${settings.newAccountDays} jour(s) ayant posté un lien externe.`,
    fields: [
      { name: 'Auteur', value: `<@${member.id}> (${member.user.tag})`, inline: true },
      { name: 'Âge du compte', value: `${ageDays.toFixed(1)} jour(s)`, inline: true },
      { name: 'Action', value: `${settings.raidAction} — ${result}`, inline: true },
      { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
      { name: 'Contenu', value: (message.content || '[embed]').slice(0, 200), inline: false },
    ],
  });

  return true;
}

export function securityStatus() {
  const settings = securitySettings();
  return {
    raidModeEnabled: settings.raidModeEnabled,
    joinRate: `${settings.joinLimit} joins / ${settings.joinWindow}s`,
    newAccountDays: settings.newAccountDays,
    raidAction: settings.raidAction,
    lockedChannels: settings.lockedChannels.length,
  };
}
