import { Events, PermissionFlagsBits } from 'discord.js';
import { getConfig, onConfigChange } from '../config.js';
import { log } from '../logger.js';

const WATCHED_KEYS = [
  'statusRoleEnabled',
  'statusRoleText',
  'statusRoleId',
  'statusRoleMatchMode',
  'statusRoleExemptRoleIds',
  'statusRoleSweepSeconds',
  'statusRoleLogChanges',
];

const COOLDOWN_MS = 10_000;
const memberCooldowns = new Map();
let presenceHandler = null;
let sweepTimer = null;
let offConfigChange = null;

function settings() {
  const config = getConfig();
  return {
    enabled: config.statusRoleEnabled === true,
    text: String(config.statusRoleText ?? ''),
    roleId: config.statusRoleId,
    matchMode: String(config.statusRoleMatchMode ?? 'contains'),
    exemptRoleIds: new Set(config.statusRoleExemptRoleIds ?? []),
    logChanges: config.statusRoleLogChanges !== false,
    sweepSeconds: Math.max(2, Number(config.statusRoleSweepSeconds) || 2),
  };
}

function customStateFromPresence(presence) {
  const activities = presence?.activities ?? [];
  const custom = activities.find((activity) => activity.type === 4);
  return custom?.state ?? null;
}

function memberActivity(member) {
  return customStateFromPresence(member?.presence);
}

function matches(state, config) {
  if (!state || !config.text) return false;
  const haystack = String(state).toLowerCase();
  const needle = config.text.toLowerCase();
  if (config.matchMode === 'exact') return haystack === needle;
  if (config.matchMode === 'startswith') return haystack.startsWith(needle);
  return haystack.includes(needle);
}

function isEligible(member, config) {
  if (!member?.id || !member.guild || member.user?.bot) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return false;
  if ([...config.exemptRoleIds].some((roleId) => member.roles?.cache?.has(roleId))) return false;
  return true;
}

async function applyRole(client, member, state, config) {
  if (!member || !config.roleId || !isEligible(member, config)) return;

  const now = Date.now();
  if (now - (memberCooldowns.get(member.id) ?? 0) < COOLDOWN_MS) return;

  const shouldHave = matches(state, config);
  const has = member.roles.cache.has(config.roleId);
  if (shouldHave === has) return;

  memberCooldowns.set(member.id, now);
  const action = shouldHave ? 'grant' : 'revoke';
  const reason = shouldHave ? 'Statut personnalisé correspondant' : 'Statut personnalisé non correspondant';

  try {
    if (shouldHave) await member.roles.add(config.roleId, reason);
    else await member.roles.remove(config.roleId, reason);

    if (config.logChanges) {
      await log(client, 'statusrole', action, {
        guild: member.guild,
        fields: [
          { name: 'Membre', value: `<@${member.id}> (${member.user.tag})`, inline: true },
          { name: 'Rôle', value: `<@&${config.roleId}>`, inline: true },
          { name: 'Statut', value: String(state ?? '(vide)').slice(0, 1000), inline: false },
        ],
      });
    }
  } catch (err) {
    memberCooldowns.delete(member.id);
    console.error(`[alln-utils] statusRole ${action} ${member.id}: ${err.message}`);
    await log(client, 'statusrole', action, {
      guild: member.guild,
      title: `Échec ${action === 'grant' ? 'attribution' : 'retrait'} rôle statut`,
      fields: [
        { name: 'Membre', value: `<@${member.id}>`, inline: true },
        { name: 'Erreur', value: String(err.message).slice(0, 1000), inline: false },
      ],
    }).catch(() => null);
  }
}

export async function applyForMember(client, member, presenceOverride = null) {
  const config = settings();
  if (!config.enabled || !config.text || !config.roleId) return;
  const state = presenceOverride
    ? customStateFromPresence(presenceOverride)
    : memberActivity(member);
  await applyRole(client, member, state, config);
}

export async function reconcileAll(client, guild) {
  const config = settings();
  if (!config.enabled || !config.text || !config.roleId) return;
  if (!guild.roles.cache.has(config.roleId)) {
    await guild.roles.fetch(config.roleId).catch(() => null);
  }
  if (!guild.roles.cache.has(config.roleId)) return;

  const members = await guild.members.fetch().catch(() => guild.members.cache);
  for (const member of members.values()) {
    await applyRole(client, member, memberActivity(member), config);
  }
}

export function startStatusRoleService(client) {
  stopStatusRoleService(client);

  offConfigChange = onConfigChange((patch) => {
    if (WATCHED_KEYS.some((key) => key in patch)) {
      queueMicrotask(() => { startStatusRoleService(client); });
    }
  });

  presenceHandler = async (oldPresence, newPresence) => {
    try {
      const config = settings();
      if (!config.enabled || !config.text || !config.roleId) return;
      if (!newPresence?.guild) return;

      const oldState = customStateFromPresence(oldPresence);
      const newState = customStateFromPresence(newPresence);
      if (matches(oldState, config) === matches(newState, config)) return;

      const member = newPresence.member
        ?? (await newPresence.guild.members.fetch(newPresence.userId).catch(() => null));
      if (member) await applyRole(client, member, newState, config);
    } catch (err) {
      console.error(`[alln-utils] statusRole presenceUpdate: ${err.stack ?? err.message}`);
    }
  };
  client.on(Events.PresenceUpdate, presenceHandler);

  const intervalMs = settings().sweepSeconds * 1000;
  sweepTimer = setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      reconcileAll(client, guild).catch((err) => console.error(`[alln-utils] statusRole sweep: ${err.message}`));
    }
  }, intervalMs);

  return true;
}

export function stopStatusRoleService(client) {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
  if (client && presenceHandler) client.off(Events.PresenceUpdate, presenceHandler);
  presenceHandler = null;
  if (offConfigChange) offConfigChange();
  offConfigChange = null;
  memberCooldowns.clear();
}
