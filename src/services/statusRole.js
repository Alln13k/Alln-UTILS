import { Events } from 'discord.js';
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
const reportedIssues = new Set();
let lastError = null;
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
  // Seules les exemptions explicites excluent un membre. Les administrateurs
  // et le propriétaire peuvent recevoir le rôle s'ils ont le statut voulu.
  if ([...config.exemptRoleIds].some((roleId) => member.roles?.cache?.has(roleId))) return false;
  return true;
}

function issueKey(guildId, roleId, issue) {
  return `${guildId}:${roleId}:${issue}`;
}

function reportIssue(client, guild, key, title, detail) {
  if (reportedIssues.has(key)) return;
  reportedIssues.add(key);
  lastError = detail;
  console.error(`[alln-utils] statusRole: ${detail}`);
  log(client, 'statusrole', 'issue', {
    guild,
    title,
    description: detail,
  }).catch(() => null);
}

async function roleIsAssignable(client, guild, roleId) {
  if (!roleId) return false;
  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    reportIssue(
      client,
      guild,
      issueKey(guild.id, roleId, 'missing'),
      'Rôle statut introuvable',
      `Le rôle <@&${roleId}> n'existe plus sur ${guild.name}.`,
    );
    return false;
  }
  if (role.id === guild.roles.everyone.id || role.managed) {
    reportIssue(
      client,
      guild,
      issueKey(guild.id, roleId, 'unassignable'),
      'Rôle statut non attribuable',
      `Le rôle <@&${roleId}> ne peut pas être attribué manuellement (@everyone ou rôle de bot).`,
    );
    return false;
  }

  const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const botHighest = botMember?.roles?.highest ?? null;
  if (!botHighest || role.position >= botHighest.position) {
    reportIssue(
      client,
      guild,
      issueKey(guild.id, roleId, 'hierarchy'),
      'Hiérarchie des rôles insuffisante',
      `Le rôle le plus élevé du bot (${botHighest?.name ?? 'inconnu'}) doit être au-dessus de <@&${roleId}>.`,
    );
    return false;
  }

  reportedIssues.delete(issueKey(guild.id, roleId, 'missing'));
  reportedIssues.delete(issueKey(guild.id, roleId, 'unassignable'));
  reportedIssues.delete(issueKey(guild.id, roleId, 'hierarchy'));
  return true;
}

async function applyRole(client, member, state, config) {
  if (!member || !config.roleId || !isEligible(member, config)) return;

  const shouldHave = matches(state, config);
  const has = member.roles.cache.has(config.roleId);
  if (shouldHave === has) return;

  if (shouldHave && !(await roleIsAssignable(client, member.guild, config.roleId))) return;

  // Un retrait doit pouvoir suivre immédiatement une attribution : la clé du
  // cooldown inclut donc l'état désiré.
  const cooldownKey = `${member.id}:${shouldHave ? 1 : 0}`;
  const now = Date.now();
  if (now - (memberCooldowns.get(cooldownKey) ?? 0) < COOLDOWN_MS) return;

  memberCooldowns.set(cooldownKey, now);
  const action = shouldHave ? 'grant' : 'revoke';
  const reason = shouldHave ? 'Statut personnalisé correspondant' : 'Statut personnalisé non correspondant';

  try {
    if (shouldHave) await member.roles.add(config.roleId, reason);
    else await member.roles.remove(config.roleId, reason);

    lastError = null;
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
    memberCooldowns.delete(cooldownKey);
    lastError = `${action} ${member.id}: ${err.message}`;
    console.error(`[alln-utils] statusRole ${lastError}`);
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

export function statusRoleDiagnostics(guild) {
  const config = settings();
  const role = config.roleId ? guild.roles.cache.get(config.roleId) : null;
  const botHighest = guild.members?.me?.roles?.highest ?? null;
  const canAssign = Boolean(
    role
    && role.id !== guild.roles.everyone.id
    && !role.managed
    && botHighest
    && role.position < botHighest.position,
  );
  const cache = guild.members?.cache;
  const members = cache ? [...cache.values()] : [];
  const matching = members.filter(
    (member) => !member.user?.bot && matches(memberActivity(member), config),
  ).length;

  return {
    enabled: config.enabled,
    text: config.text,
    mode: config.matchMode,
    roleId: config.roleId,
    roleName: role?.name ?? null,
    roleExists: Boolean(role),
    canAssign,
    botHighestName: botHighest?.name ?? null,
    matching,
    lastError,
  };
}

export function startStatusRoleService(client) {
  stopStatusRoleService(client);

  offConfigChange = onConfigChange((patch) => {
    if (WATCHED_KEYS.some((key) => key in patch)) {
      reportedIssues.clear();
      lastError = null;
      queueMicrotask(() => { startStatusRoleService(client); });
    }
  });

  // On réconcilie à chaque changement de présence, même si l'état de
  // correspondance est identique : cela répare aussi un rôle retiré à la main.
  presenceHandler = async (_oldPresence, newPresence) => {
    try {
      const config = settings();
      if (!config.enabled || !config.text || !config.roleId) return;
      if (!newPresence?.guild) return;

      const state = customStateFromPresence(newPresence);
      const member = newPresence.member
        ?? (await newPresence.guild.members.fetch(newPresence.userId).catch(() => null));
      if (member) await applyRole(client, member, state, config);
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

  // Premier passage immédiat : les présences sont déjà en cache au ready.
  for (const guild of client.guilds.cache.values()) {
    reconcileAll(client, guild).catch(() => null);
  }

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
