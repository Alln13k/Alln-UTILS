import { readStore, writeStore } from './store.js';
import { LOG_DEFAULTS } from './logDefaults.js';

export const CONFIG_KEYS = {
  embedColor: { type: 'hex', default: '#000000', label: 'Couleur embeds publics' },
  embedColorDark: { type: 'hex', default: '#0a0a0a', label: 'Couleur embeds sombres' },
  footer: { type: 'string', default: 'Alln UTILS', label: 'Footer public' },
  footerDark: { type: 'string', default: 'Alln UTILS // private', label: 'Footer sombre' },
  logChannelId: { type: 'channel', default: null, label: 'Salon de logs principal' },
  welcomeChannelId: { type: 'channel', default: null, label: 'Salon de bienvenue' },
  leaksChannelId: { type: 'channel', default: null, label: 'Salon des leaks' },
  toolsChannelId: { type: 'channel', default: null, label: 'Salon des tools' },
  vouchChannelId: { type: 'channel', default: null, label: 'Salon des vouchs' },
  suggestionsChannelId: { type: 'channel', default: null, label: 'Salon des suggestions' },
  bumpsChannelId: { type: 'channel', default: null, label: 'Salon des bumps' },
  ticketCategoryId: { type: 'channel', default: null, label: 'Catégorie des tickets' },
  ticketLogChannelId: { type: 'channel', default: null, label: 'Salon logs tickets' },
  ticketTranscriptChannelId: { type: 'channel', default: null, label: 'Salon transcripts' },
  ticketLimitPerUser: { type: 'int', default: 3, min: 1, max: 50, label: 'Tickets max par user' },
  ticketForms: { type: 'json', default: {}, label: 'Formulaires de tickets par catégorie' },
  ticketStaffRoleId: { type: 'role', default: null, label: 'Rôle staff tickets' },
  staffRoleId: { type: 'role', default: null, label: 'Rôle staff global' },
  verifiedRoleId: { type: 'role', default: null, label: 'Rôle vérifié (règlement accepté)' },
  unverifiedRoleId: { type: 'role', default: null, label: 'Rôle non vérifié (optionnel)' },
  rulesChannelId: { type: 'channel', default: null, label: 'Salon du panneau de règles' },
  nsfwRoleId: { type: 'role', default: null, label: 'Rôle d\'accès NSFW' },
  nsfwChannelId: { type: 'channel', default: null, label: 'Salon de vérification NSFW' },
  vouchRoleId: { type: 'role', default: null, label: 'Rôle vouch' },
  premiumRoleId: { type: 'role', default: null, label: 'Rôle premium' },
  premiumDurationDays: { type: 'int', default: 30, min: 1, max: 3650, label: 'Durée premium (jours)' },
  autoroleId: { type: 'role', default: null, label: 'Rôle automatique' },
  raidTrapChannelId: { type: 'channel', default: null, label: 'Salon piège' },
  raidTrapEnabled: { type: 'bool', default: false, label: 'Piège à raid actif' },
  raidTrapBanReason: { type: 'string', default: 'raid trap', label: 'Raison du ban piège' },
  raidTrapWhitelist: { type: 'roleList', default: [], label: 'Rôles ignorés par le piège' },
  raidModeEnabled: { type: 'bool', default: false, label: 'Raid mode actif' },
  raidModeLockedChannels: { type: 'channelList', default: [], label: 'Salons verrouillés en raid mode' },

  starboardChannelId: { type: 'channel', default: null, label: 'Salon starboard' },
  starboardThreshold: { type: 'int', default: 3, min: 1, max: 100, label: 'Seuil starboard' },
  starboardEmoji: { type: 'string', default: '⭐', label: 'Emoji starboard' },

  statsMembersChannelId: { type: 'channel', default: null, label: 'Vocal stats membres' },
  statsGiveawaysChannelId: { type: 'channel', default: null, label: 'Vocal stats giveaways' },
  statsTicketsChannelId: { type: 'channel', default: null, label: 'Vocal stats tickets' },
  statsLeaksChannelId: { type: 'channel', default: null, label: 'Vocal stats leaks' },

  automodEnabled: { type: 'bool', default: true, label: 'Automod actif' },
  automodSpamCount: { type: 'int', default: 5, min: 2, max: 50, label: 'Automod — messages max' },
  automodSpamWindow: { type: 'int', default: 10, min: 2, max: 300, label: 'Automod — fenêtre spam (s)' },
  automodCapsPercent: { type: 'int', default: 70, min: 10, max: 100, label: 'Automod — % majuscules' },
  automodCapsMinLength: { type: 'int', default: 10, min: 3, max: 200, label: 'Automod — longueur min caps' },
  automodMentionsMax: { type: 'int', default: 5, min: 1, max: 50, label: 'Automod — mentions max' },
  automodLinkMinLevel: { type: 'int', default: 5, min: 0, max: 100, label: 'Automod — niveau min liens' },
  automodImmuneRoles: { type: 'roleList', default: [], label: 'Automod — rôles immunisés' },
  antiPhishingEnabled: { type: 'bool', default: true, label: 'Anti-phishing actif' },
  antiPhishingApiUrl: { type: 'string', default: null, label: 'Anti-phishing — API externe (optionnelle)' },
  antiPhishingMuteMinutes: { type: 'int', default: 60, min: 1, max: 10080, label: 'Anti-phishing — mute (minutes)' },

  warnMuteAt: { type: 'int', default: 3, min: 1, max: 50, label: 'Warns → mute' },
  warnKickAt: { type: 'int', default: 5, min: 1, max: 50, label: 'Warns → kick' },
  warnBanAt: { type: 'int', default: 7, min: 1, max: 50, label: 'Warns → ban' },

  levelMinXp: { type: 'int', default: 15, min: 1, max: 100, label: 'XP minimum par message' },
  levelMaxXp: { type: 'int', default: 25, min: 1, max: 200, label: 'XP maximum par message' },
  levelCooldownSeconds: { type: 'int', default: 60, min: 5, max: 3600, label: 'Cooldown XP (s)' },

  securityJoinRateCount: { type: 'int', default: 10, min: 2, max: 200, label: 'Sécurité — joins max' },
  securityJoinRateWindow: { type: 'int', default: 10, min: 2, max: 300, label: 'Sécurité — fenêtre joins (s)' },
  securityNewAccountDays: { type: 'int', default: 7, min: 1, max: 90, label: 'Sécurité — jours compte récent' },
  securityRaidAction: { type: 'string', default: 'kick', label: 'Sécurité — action (kick/ban)' },

  customCommandPrefix: { type: 'string', default: '!', label: 'Préfixe commandes custom' },

  voiceHubChannelId: { type: 'channel', default: null, label: 'Vocal — join to create' },
  voiceCategoryId: { type: 'channel', default: null, label: 'Vocal — catégorie temporaires' },
  voiceMaxMembers: { type: 'int', default: 5, min: 0, max: 99, label: 'Vocal — membres max' },

  memberCountChannelId: { type: 'channel', default: null, label: 'Vocal compteur de membres' },
  memberCountTemplate: { type: 'string', default: '👥 Membres : {count}', label: 'Template compteur' },
  memberCountUpdateSeconds: { type: 'int', default: 300, min: 120, max: 3600, label: 'Compteur — intervalle (s)' },
  memberCountIncludeBots: { type: 'bool', default: false, label: 'Compteur — inclure les bots' },
  memberCountEnabled: { type: 'bool', default: true, label: 'Compteur — service actif' },

  bumpAutoReminder: { type: 'bool', default: true, label: 'Rappels de bump automatiques' },
  announceCooldownSeconds: { type: 'int', default: 3600, min: 60, max: 86400, label: 'Annonces — cooldown par staff (s)' },
  massInviteThreshold: { type: 'int', default: 10, min: 2, max: 200, label: 'Masscheck — invitations suspectes min' },
  massInviteMaxAgeDays: { type: 'int', default: 7, min: 1, max: 90, label: 'Masscheck — âge max des invitations (jours)' },

  logEvents: { type: 'json', default: LOG_DEFAULTS, label: 'Logs — événements activés' },
  logChannelOverrides: { type: 'json', default: {}, label: 'Logs — salons par événement' },
  logExcludedChannels: { type: 'channelList', default: [], label: 'Logs — salons exclus' },
};

function cloneDefault(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return structuredClone(value);
  return value;
}

export const DEFAULT_CONFIG = Object.fromEntries(
  Object.entries(CONFIG_KEYS).map(([key, meta]) => [key, cloneDefault(meta.default)]),
);

function mergeLogEvents(base, patch) {
  const out = {};
  const categories = new Set([...Object.keys(base), ...Object.keys(patch ?? {})]);
  for (const category of categories) {
    out[category] = { ...(base[category] ?? {}), ...(patch?.[category] ?? {}) };
  }
  return out;
}

let cache = null;

export function getConfig() {
  if (cache) return cache;

  const stored = readStore('config', {});
  const merged = { ...structuredClone(DEFAULT_CONFIG), ...stored };
  merged.logEvents = mergeLogEvents(LOG_DEFAULTS, stored.logEvents);
  merged.logChannelOverrides = { ...(stored.logChannelOverrides ?? {}) };
  merged.logExcludedChannels = Array.isArray(stored.logExcludedChannels) ? stored.logExcludedChannels : [];

  cache = merged;

  const normalized = Object.fromEntries(
    Object.keys(CONFIG_KEYS).map((key) => [key, merged[key]]),
  );
  writeStore('config', normalized);

  return cache;
}

export function saveConfig(patch) {
  const next = { ...getConfig(), ...patch };
  if (patch.logEvents && typeof patch.logEvents === 'object' && !Array.isArray(patch.logEvents)) {
    next.logEvents = mergeLogEvents(LOG_DEFAULTS, patch.logEvents);
  }
  cache = next;
  writeStore('config', next);
  return next;
}

export function setConfigValue(key, value) {
  if (!(key in CONFIG_KEYS)) throw new Error(`clé inconnue: ${key}`);
  return saveConfig({ [key]: value });
}

export function resetConfigValue(key) {
  if (!(key in CONFIG_KEYS)) throw new Error(`clé inconnue: ${key}`);
  const meta = CONFIG_KEYS[key];
  return saveConfig({ [key]: cloneDefault(meta.default) });
}

export function configKeyList() {
  return Object.keys(CONFIG_KEYS);
}

export function describeConfigKey(key) {
  const meta = CONFIG_KEYS[key];
  if (!meta) return null;
  return `${key} (${meta.type}) — ${meta.label} — défaut: ${JSON.stringify(meta.default)}`;
}
