import { getConfig } from '../config.js';
import {
  deleteGiveaway,
  getGiveaway,
  getLevelUser,
  getPremium,
  listGiveaways,
  saveGiveaway,
  updateGiveaway,
  vouchsGiven,
} from '../db.js';
import { buildEmbed } from '../embeds.js';
import { buildGiveawayPayload } from '../giveawayUi.js';
import { log } from '../logger.js';

const MAX_TIMEOUT = 2_147_483_647;
const REFRESH_MS = 15_000;

const timers = new Map();
let refreshTimer = null;

function firstGuild(client, guildId) {
  return client.guilds.cache.get(guildId) ?? client.guilds.cache.first() ?? null;
}

function pickWinners(participants, count, exclude = []) {
  const excluded = new Set(exclude);
  const pool = participants.filter((id) => !excluded.has(id));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(1, count));
}

async function validParticipants(guild, giveaway) {
  const valid = [];
  for (const userId of giveaway.participants ?? []) {
    const member = guild.members.cache.get(userId)
      ?? (await guild.members.fetch(userId).catch(() => null));
    if (member) valid.push(userId);
  }
  return valid;
}

export function checkGiveawayConditions(member, giveaway) {
  const conditions = giveaway.conditions ?? {};
  const config = getConfig();

  if (conditions.roleId && !member.roles.cache.has(conditions.roleId)) {
    return { ok: false, reason: `Il te faut le rôle <@&${conditions.roleId}> pour participer.` };
  }

  if (conditions.premiumRequired) {
    const premium = getPremium(member.id);
    const active = premium && new Date(premium.expiresAt).getTime() > Date.now();
    const hasRole = config.premiumRoleId && member.roles.cache.has(config.premiumRoleId);
    if (!active && !hasRole) {
      return { ok: false, reason: 'Un accès premium est requis pour participer.' };
    }
  }

  if (conditions.levelRequired) {
    const level = Math.floor(getLevelUser(member.id).xp / 100);
    if (level < conditions.levelRequired) {
      return { ok: false, reason: `Niveau ${conditions.levelRequired} requis (tu es niveau ${level}).` };
    }
  }

  if (conditions.vouchRequired) {
    const count = vouchsGiven(member.id).length;
    if (count < conditions.vouchRequired) {
      return { ok: false, reason: `${conditions.vouchRequired} vouch(s) requis (tu en as ${count}).` };
    }
  }

  if (conditions.minAccountDays) {
    const days = (Date.now() - member.user.createdTimestamp) / 86_400_000;
    if (days < conditions.minAccountDays) {
      return { ok: false, reason: `Ton compte doit avoir au moins ${conditions.minAccountDays} jour(s).` };
    }
  }

  return { ok: true, reason: null };
}

export function scheduleGiveaway(client, giveaway) {
  clearGiveawayTimer(giveaway.id);
  if (!giveaway || giveaway.ended) return;

  const delay = new Date(giveaway.endsAt).getTime() - Date.now();
  const wait = Math.max(0, Math.min(delay, MAX_TIMEOUT));

  const timer = setTimeout(() => {
    if (delay > MAX_TIMEOUT) {
      scheduleGiveaway(client, getGiveaway(giveaway.id));
      return;
    }
    endGiveaway(client, giveaway.id).catch((err) => console.error(`[alln-utils] giveaway end: ${err.message}`));
  }, wait);

  timers.set(String(giveaway.id), timer);
}

export function clearGiveawayTimer(id) {
  const timer = timers.get(String(id));
  if (timer) clearTimeout(timer);
  timers.delete(String(id));
}

async function fetchGiveawayMessage(client, giveaway) {
  const guild = firstGuild(client, giveaway.guildId);
  if (!guild) return { guild: null, channel: null, message: null };
  const channel = guild.channels.cache.get(giveaway.channelId)
    ?? (await guild.channels.fetch(giveaway.channelId).catch(() => null));
  if (!channel?.isTextBased()) return { guild, channel: null, message: null };
  const message = giveaway.messageId
    ? await channel.messages.fetch(giveaway.messageId).catch(() => null)
    : null;
  return { guild, channel, message };
}

export async function endGiveaway(client, id) {
  const giveaway = getGiveaway(id);
  if (!giveaway) return { ok: false, error: 'Giveaway introuvable.' };
  if (giveaway.ended) return { ok: false, error: 'Ce giveaway est déjà terminé.' };

  const { guild, channel, message } = await fetchGiveawayMessage(client, giveaway);
  if (!guild) return { ok: false, error: 'Serveur introuvable.' };

  const participants = await validParticipants(guild, giveaway);
  const winners = pickWinners(participants, giveaway.winnerCount ?? 1);

  const updated = updateGiveaway(id, {
    ended: true,
    winners,
    endedAt: new Date().toISOString(),
  });
  clearGiveawayTimer(id);

  if (message) {
    await message.edit(buildGiveawayPayload(updated)).catch(() => null);
  }

  if (channel?.isTextBased()) {
    if (winners.length > 0) {
      await channel.send({
        content: `🎉 Félicitations ${winners.map((userId) => `<@${userId}>`).join(', ')} — tu remportes **${giveaway.prize}** !`,
        allowedMentions: { users: winners },
      }).catch(() => null);
    } else {
      await channel.send({
        embeds: [buildEmbed({ dark: true, title: 'Giveaway terminé', description: 'Aucun participant valide.' })],
      }).catch(() => null);
    }
  }

  for (const userId of winners) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) continue;
    await user.send({
      embeds: [buildEmbed({
        dark: true,
        title: '🎁 Tu as gagné !',
        description: `Tu remportes **${giveaway.prize}** sur **${guild.name}**.`,
        fields: [{ name: 'Giveaway', value: `#${giveaway.id}`, inline: true }],
      })],
    }).catch(() => null);
  }

  await log(client, 'giveaways', 'end', {
    guild,
    fields: [
      { name: 'Prix', value: giveaway.prize, inline: true },
      { name: 'Gagnants', value: winners.length ? winners.map((userId) => `<@${userId}>`).join(', ') : 'aucun', inline: false },
      { name: 'Participants', value: String(participants.length), inline: true },
      { name: 'Hôte', value: `<@${giveaway.hostId}>`, inline: true },
    ],
  });

  return { ok: true, winners, giveaway: updated };
}

export async function rerollGiveaway(client, id) {
  const giveaway = getGiveaway(id);
  if (!giveaway) return { ok: false, error: 'Giveaway introuvable.' };
  if (!giveaway.ended) return { ok: false, error: 'Termine d\'abord le giveaway avant de reroll.' };

  const { guild, channel, message } = await fetchGiveawayMessage(client, giveaway);
  if (!guild) return { ok: false, error: 'Serveur introuvable.' };

  const participants = await validParticipants(guild, giveaway);
  const previous = giveaway.winners ?? [];
  const pool = participants.filter((userId) => !previous.includes(userId));

  if (pool.length === 0) return { ok: false, error: 'Aucun participant éligible pour le reroll.' };

  const [newWinner] = pickWinners(pool, 1);
  const winners = previous.length > 1 ? [...previous.slice(0, -1), newWinner] : [newWinner];
  const updated = updateGiveaway(id, { winners });

  if (message) await message.edit(buildGiveawayPayload(updated)).catch(() => null);

  if (channel?.isTextBased()) {
    await channel.send({
      content: `🎉 Reroll : <@${newWinner}> remporte **${giveaway.prize}** !`,
      allowedMentions: { users: [newWinner] },
    }).catch(() => null);
  }

  const user = await client.users.fetch(newWinner).catch(() => null);
  if (user) {
    await user.send({
      embeds: [buildEmbed({
        dark: true,
        title: '🎁 Nouveau tirage — tu as gagné !',
        description: `Tu remportes **${giveaway.prize}** sur **${guild.name}**.`,
      })],
    }).catch(() => null);
  }

  await log(client, 'giveaways', 'reroll', {
    guild,
    fields: [
      { name: 'Prix', value: giveaway.prize, inline: true },
      { name: 'Nouveau gagnant', value: `<@${newWinner}>`, inline: true },
      { name: 'Hôte', value: `<@${giveaway.hostId}>`, inline: true },
    ],
  });

  return { ok: true, winners, giveaway: updated };
}

export async function refreshGiveaways(client) {
  for (const giveaway of listGiveaways(true)) {
    const { message } = await fetchGiveawayMessage(client, giveaway);
    if (!message) continue;
    await message.edit(buildGiveawayPayload(giveaway)).catch(() => null);
  }
}

export function startGiveawayService(client) {
  stopGiveawayService();
  for (const giveaway of listGiveaways(true)) scheduleGiveaway(client, giveaway);
  refreshTimer = setInterval(() => {
    refreshGiveaways(client).catch((err) => console.error(`[alln-utils] giveaway refresh: ${err.message}`));
  }, REFRESH_MS);
}

export function stopGiveawayService() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

export { deleteGiveaway };
