import { PermissionFlagsBits } from 'discord.js';
import { getConfig } from '../config.js';
import {
  addLevelXp,
  getLevelTiers,
  getLevelUser,
  listGates,
  listLevels,
} from '../db.js';

const XP_PER_LEVEL = 100;

export function levelFromXp(xp) {
  return Math.floor((Number(xp) || 0) / XP_PER_LEVEL);
}

export function levelProgress(xp) {
  const level = levelFromXp(xp);
  const into = (Number(xp) || 0) % XP_PER_LEVEL;
  const percent = Math.round((into / XP_PER_LEVEL) * 100);
  const filled = Math.round((into / XP_PER_LEVEL) * 20);
  return {
    level,
    into,
    needed: XP_PER_LEVEL - into,
    percent,
    bar: `${'█'.repeat(filled)}${'░'.repeat(20 - filled)}`,
  };
}

export function topLevels(limit = 10) {
  return listLevels()
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit)
    .map((entry) => ({ ...entry, level: levelFromXp(entry.xp) }));
}

export async function applyLevelRewards(member, level) {
  const tiers = getLevelTiers();
  for (const [tierLevel, roleId] of Object.entries(tiers)) {
    if (Number(tierLevel) > level) continue;
    if (!roleId || member.roles.cache.has(roleId)) continue;
    await member.roles.add(roleId, `Palier niveau ${tierLevel}`).catch(() => null);
  }

  for (const gate of listGates()) {
    if (!gate.minLevel || gate.minLevel > level || !gate.channelId) continue;
    const channel = member.guild.channels.cache.get(gate.channelId)
      ?? (await member.guild.channels.fetch(gate.channelId).catch(() => null));
    if (!channel?.permissionOverwrites) continue;
    await channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      ReadMessageHistory: true,
    }, { reason: `Palier niveau ${gate.minLevel}` }).catch(() => null);
  }
}

export async function handleMessageXp(client, message) {
  if (!message.guild || message.author?.bot) return null;

  const config = getConfig();
  const cooldown = Math.max(5, Number(config.levelCooldownSeconds) || 60) * 1000;
  const current = getLevelUser(message.author.id);
  const now = Date.now();

  if (now - current.lastMessageAt < cooldown) return null;

  if (message.member?.isCommunicationDisabled?.()) return null;

  const everyone = message.channel.permissionsFor(message.guild.roles.everyone);
  if (everyone && !everyone.has(PermissionFlagsBits.SendMessages)) return null;

  const min = Math.max(1, Number(config.levelMinXp) || 15);
  const max = Math.max(min, Number(config.levelMaxXp) || 25);
  const amount = Math.floor(Math.random() * (max - min + 1)) + min;

  const oldLevel = levelFromXp(current.xp);
  const xp = addLevelXp(message.author.id, amount, now);
  const newLevel = levelFromXp(xp);

  if (newLevel > oldLevel && message.member) {
    await applyLevelRewards(message.member, newLevel);
  }

  return { amount, xp, level: newLevel, leveledUp: newLevel > oldLevel };
}
