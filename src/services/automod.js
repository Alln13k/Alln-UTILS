import { getConfig } from '../config.js';
import { addWarn, getLevelUser, getWordlist } from '../db.js';
import { log } from '../logger.js';
import { isStaff } from '../permissions.js';
import { applyWarnThresholds } from '../warnSystem.js';

const INVITE_PATTERN = /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i;
const LINK_PATTERN = /(https?:\/\/|www\.)/i;
const MUTE_MS = 10 * 60 * 1000;

const spamTracker = new Map();

function isImmune(member, config) {
  if (!member) return true;
  if (isStaff(member)) return true;
  return (config.automodImmuneRoles ?? []).some((roleId) => member.roles.cache.has(roleId));
}

async function warnMember(client, member, reason) {
  addWarn(member.id, { moderator: 'automod', reason, type: 'automod' });
  await applyWarnThresholds(client, member.guild, member, { reason });
}

async function removeAndLog(client, message, type, extraFields = []) {
  await message.delete().catch(() => null);
  await log(client, 'automod', type, {
    guild: message.guild,
    fields: [
      { name: 'Auteur', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
      { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
      { name: 'Contenu', value: (message.content || '[embed/pièce jointe]').slice(0, 200), inline: false },
      ...extraFields,
    ],
  });
}

export async function handleAutomod(client, message) {
  if (!message.guild || message.author?.bot) return false;

  const config = getConfig();
  if (!config.automodEnabled) return false;

  const member = message.member
    ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return false;
  if (isImmune(member, config)) return false;

  const content = message.content ?? '';

  if (INVITE_PATTERN.test(content)) {
    await removeAndLog(client, message, 'invites', [{ name: 'Règle', value: 'Invitation Discord', inline: true }]);
    return true;
  }

  if (LINK_PATTERN.test(content)) {
    const level = Math.floor(getLevelUser(member.id).xp / 100);
    if (level < (Number(config.automodLinkMinLevel) || 0)) {
      await removeAndLog(client, message, 'links', [
        { name: 'Règle', value: `Lien sous niveau ${config.automodLinkMinLevel}`, inline: true },
        { name: 'Niveau', value: String(level), inline: true },
      ]);
      await warnMember(client, member, 'Lien externe sous le niveau requis');
      return true;
    }
  }

  const words = getWordlist();
  if (words.length > 0) {
    const lower = content.toLowerCase();
    const found = words.find((word) => lower.includes(word.toLowerCase()));
    if (found) {
      await removeAndLog(client, message, 'wordlist', [{ name: 'Mot', value: found.slice(0, 100), inline: true }]);
      return true;
    }
  }

  const mentions = (message.mentions?.users?.size ?? 0) + (message.mentions?.roles?.size ?? 0);
  if (mentions > (Number(config.automodMentionsMax) || 5)) {
    await removeAndLog(client, message, 'mentions', [
      { name: 'Mentions', value: String(mentions), inline: true },
      { name: 'Action', value: 'timeout 10 minutes', inline: true },
    ]);
    await member.timeout(MUTE_MS, 'Automod — mentions massives').catch(() => null);
    return true;
  }

  const letters = content.replace(/[^a-zA-Z]/g, '');
  if (letters.length >= (Number(config.automodCapsMinLength) || 10)) {
    const uppercase = letters.replace(/[^A-Z]/g, '').length;
    const percent = Math.round((uppercase / letters.length) * 100);
    if (percent > (Number(config.automodCapsPercent) || 70)) {
      await removeAndLog(client, message, 'caps', [
        { name: 'Majuscules', value: `${percent}%`, inline: true },
        { name: 'Action', value: 'warn', inline: true },
      ]);
      await warnMember(client, member, 'Excès de majuscules');
      return true;
    }
  }

  const now = Date.now();
  const windowMs = Math.max(2, Number(config.automodSpamWindow) || 10) * 1000;
  const limit = Math.max(2, Number(config.automodSpamCount) || 5);
  const history = (spamTracker.get(member.id) ?? []).filter((timestamp) => now - timestamp <= windowMs);
  history.push(now);
  spamTracker.set(member.id, history);

  if (history.length > limit) {
    spamTracker.delete(member.id);
    await removeAndLog(client, message, 'spam', [
      { name: 'Messages', value: `${history.length} en ${Math.round(windowMs / 1000)}s`, inline: true },
      { name: 'Action', value: 'timeout 10 minutes', inline: true },
    ]);
    await member.timeout(MUTE_MS, 'Automod — spam').catch(() => null);
    return true;
  }

  return false;
}
