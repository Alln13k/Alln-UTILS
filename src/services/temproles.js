import { randomUUID } from 'node:crypto';
import { listTempRoles, removeTempRoleById } from '../db.js';
import { log } from '../logger.js';

const MAX_TIMEOUT = 2_147_483_647;
const timers = new Map();

async function expireTempRole(client, entry) {
  timers.delete(entry.id);

  const current = listTempRoles().find((item) => item.id === entry.id);
  if (!current) return null;

  const guild = client.guilds.cache.get(current.guildId);
  if (!guild) {
    removeTempRoleById(current.id);
    return null;
  }

  const member = await guild.members.fetch(current.userId).catch(() => null);
  if (member) {
    await member.roles.remove(current.roleId, 'Rôle temporaire expiré').catch(() => null);
  }

  removeTempRoleById(current.id);

  await log(client, 'temprole', 'expire', {
    guild,
    fields: [
      { name: 'Membre', value: `<@${current.userId}>`, inline: true },
      { name: 'Rôle', value: `<@&${current.roleId}>`, inline: true },
      { name: 'Expiré le', value: `<t:${Math.floor(new Date(current.expiresAt).getTime() / 1000)}:F>`, inline: true },
    ],
  });

  return current;
}

function schedule(client, entry) {
  if (timers.has(entry.id)) clearTimeout(timers.get(entry.id));

  const delay = new Date(entry.expiresAt).getTime() - Date.now();
  if (delay <= 0) {
    expireTempRole(client, entry).catch((err) => console.error(`[alln-utils] temprole expire: ${err.message}`));
    return;
  }

  const timer = setTimeout(() => {
    const remaining = new Date(entry.expiresAt).getTime() - Date.now();
    if (remaining > 0) {
      schedule(client, entry);
      return;
    }
    expireTempRole(client, entry).catch((err) => console.error(`[alln-utils] temprole expire: ${err.message}`));
  }, Math.min(delay, MAX_TIMEOUT));

  timers.set(entry.id, timer);
}

export function createTempRoleEntry({ userId, roleId, guildId, expiresAt, addedBy, reason }) {
  return {
    id: randomUUID(),
    userId,
    roleId,
    guildId,
    expiresAt,
    addedBy,
    reason: reason ?? null,
    createdAt: new Date().toISOString(),
  };
}

export function registerTempRole(client, entry) {
  schedule(client, entry);
  return entry;
}

export function unregisterTempRole(id) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
}

export function startTempRoleService(client) {
  for (const entry of listTempRoles()) {
    schedule(client, entry);
  }
}

export function stopTempRoleService() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
