import { addInviteRecord, markInviteLeft } from '../db.js';

const cache = new Map();

export async function cacheGuildInvites(guild) {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return;
  const map = new Map();
  for (const invite of invites.values()) {
    map.set(invite.code, invite.uses ?? 0);
  }
  cache.set(guild.id, map);
}

export function startInviteService(client) {
  for (const guild of client.guilds.cache.values()) {
    cacheGuildInvites(guild).catch(() => null);
  }
}

export async function handleInviteJoin(member) {
  const guild = member.guild;
  const previous = cache.get(guild.id) ?? new Map();
  const invites = await guild.invites.fetch().catch(() => null);

  let used = null;
  if (invites) {
    for (const invite of invites.values()) {
      const before = previous.get(invite.code) ?? 0;
      if ((invite.uses ?? 0) > before) {
        used = invite;
        break;
      }
    }

    const next = new Map();
    for (const invite of invites.values()) next.set(invite.code, invite.uses ?? 0);
    cache.set(guild.id, next);
  }

  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  const suspect = accountAgeDays < 7;

  const record = {
    inviteeId: member.id,
    inviterId: used?.inviter?.id ?? null,
    inviterTag: used?.inviter?.tag ?? null,
    code: used?.code ?? null,
    joinedAt: new Date().toISOString(),
    suspect,
    accountAgeDays: Math.floor(accountAgeDays),
  };

  addInviteRecord(record);
  return record;
}

export function handleInviteLeave(member) {
  return markInviteLeft(member.id);
}

export function inviteCacheSize(guildId) {
  return (cache.get(guildId) ?? new Map()).size;
}
