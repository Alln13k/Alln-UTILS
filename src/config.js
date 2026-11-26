import { readStore, writeStore } from './store.js';
import { LOG_DEFAULTS, LOG_TITLES } from './logDefaults.js';

export { LOG_DEFAULTS, LOG_TITLES };

function cloneDefault(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return structuredClone(value);
  return value;
}

export const CONFIG_KEYS = {
  embedColor: { type: 'hex', default: '#000000', label: 'Couleur embeds publics' },
  embedColorDark: { type: 'hex', default: '#0a0a0a', label: 'Couleur embeds sombres' },
  footer: { type: 'string', default: 'Alln UTILS', label: 'Footer public', maxLength: 100 },
  footerDark: { type: 'string', default: 'Alln UTILS // private', label: 'Footer sombre', maxLength: 100 },

  logChannelId: { type: 'channel', default: null, label: 'Salon de logs principal' },
  logEvents: { type: 'json', default: LOG_DEFAULTS, label: 'Logs — événements activés' },
  logChannelOverrides: { type: 'json', default: {}, label: 'Logs — salons par événement' },

  welcomeChannelId: { type: 'channel', default: null, label: 'Salon de bienvenue' },
  suggestionsChannelId: { type: 'channel', default: null, label: 'Salon des suggestions' },

  autoroleId: { type: 'role', default: null, label: 'Rôle automatique' },
  staffRoleId: { type: 'role', default: null, label: 'Rôle staff global' },
  ticketStaffRoleId: { type: 'role', default: null, label: 'Rôle staff tickets' },
  premiumRoleId: { type: 'role', default: null, label: 'Rôle premium' },

  rulesChannelId: { type: 'channel', default: null, label: 'Salon du panneau de règles' },
  verifiedRoleId: { type: 'role', default: null, label: 'Rôle vérifié (règlement accepté)' },
  unverifiedRoleId: { type: 'role', default: null, label: 'Rôle non vérifié (optionnel)' },

  ticketCategoryId: { type: 'channel', default: null, label: 'Catégorie des tickets' },
  ticketLogChannelId: { type: 'channel', default: null, label: 'Salon logs tickets' },
  ticketTranscriptChannelId: { type: 'channel', default: null, label: 'Salon transcripts' },
  ticketLimitPerUser: { type: 'int', default: 3, min: 1, max: 50, label: 'Tickets max par user' },

  warnThresholds: { type: 'json', default: { mute: 3, kick: 5, ban: 7 }, label: 'Seuils warns (mute/kick/ban)' },

  automodSettings: {
    type: 'json',
    default: {
      spam: { count: 5, window: 10 },
      caps: { percent: 70, minLength: 10 },
      mentions: { max: 5 },
      links: { minLevel: 5 },
      invites: { enabled: true },
      wordlist: { enabled: true },
    },
    label: 'Paramètres auto-modération',
  },

  raidTrapChannelId: { type: 'channel', default: null, label: 'Salon piège vocal' },
  raidTrapEnabled: { type: 'bool', default: false, label: 'Piège à raid actif' },
  raidTrapBanReason: { type: 'string', default: 'raid trap', label: 'Raison du kick piège', maxLength: 512 },
  raidTrapWhitelist: { type: 'roleList', default: [], label: 'Rôles ignorés par le piège' },
  raidModeEnabled: { type: 'bool', default: false, label: 'Raid mode actif' },
  raidModeLockedChannels: { type: 'channelList', default: [], label: 'Salons verrouillés en raid mode' },

  memberCountChannelId: { type: 'channel', default: null, label: 'Vocal compteur de membres' },
  memberCountTemplate: { type: 'string', default: '👥 Membres : {count}', label: 'Template compteur', maxLength: 100 },
  memberCountUpdateSeconds: { type: 'int', default: 300, min: 120, max: 3600, label: 'Compteur — intervalle (s)' },
  memberCountIncludeBots: { type: 'bool', default: false, label: 'Compteur — inclure les bots' },
  memberCountEnabled: { type: 'bool', default: true, label: 'Compteur — service actif' },

  statusRoleText: { type: 'string', default: '', label: 'Texte détecté dans le statut personnalisé', maxLength: 200 },
  statusRoleId: { type: 'role', default: null, label: 'Rôle attribué si statut match' },
  statusRoleEnabled: { type: 'bool', default: false, label: 'Watcher statut actif' },
  statusRoleMatchMode: { type: 'string', default: 'contains', label: 'Mode de correspondance', maxLength: 20 },
  statusRoleExemptRoleIds: { type: 'roleList', default: [], label: 'Rôles exemptés du watcher statut' },
  statusRoleSweepSeconds: { type: 'int', default: 2, min: 2, label: 'Intervalle balayage statut (s)' },
  statusRoleLogChanges: { type: 'bool', default: true, label: 'Logs attributions/retraits statut' },
};

export const DEFAULT_CONFIG = Object.fromEntries(
  Object.entries(CONFIG_KEYS).map(([key, meta]) => [key, cloneDefault(meta.default)]),
);

function mergeLogEvents(base, patch) {
  const out = {};
  const categories = new Set([...Object.keys(base ?? {}), ...Object.keys(patch ?? {})]);
  for (const category of categories) {
    out[category] = { ...(base[category] ?? {}), ...(patch?.[category] ?? {}) };
  }
  return out;
}

const SNOWFLAKE = /^\d{15,25}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function validateConfigValue(key, value) {
  const meta = CONFIG_KEYS[key];
  if (!meta) throw new Error(`Clé de configuration inconnue : ${key}`);

  if (meta.type === 'bool') return Boolean(value);

  if (meta.type === 'int') {
    const number = typeof value === 'number' ? value : Number(String(value ?? '').trim());
    if (!Number.isInteger(number)) throw new Error('Valeur entière attendue.');
    if (meta.min !== undefined && number < meta.min) throw new Error(`Minimum autorisé : ${meta.min}.`);
    if (meta.max !== undefined && number > meta.max) throw new Error(`Maximum autorisé : ${meta.max}.`);
    return number;
  }

  if (meta.type === 'hex') {
    let color = String(value ?? '').trim();
    if (!color.startsWith('#')) color = `#${color}`;
    if (!HEX_COLOR.test(color)) throw new Error('Couleur hexadécimale attendue, par exemple #000000.');
    return color.toLowerCase();
  }

  if (meta.type === 'string') {
    const text = String(value ?? '');
    if (text.length > (meta.maxLength ?? 1000)) {
      throw new Error(`Texte trop long (maximum ${meta.maxLength ?? 1000} caractères).`);
    }
    return text;
  }

  if (meta.type === 'channel' || meta.type === 'role') {
    if (value === null || value === undefined || value === '') return null;
    const id = String(value);
    if (!SNOWFLAKE.test(id)) throw new Error('Identifiant Discord invalide.');
    return id;
  }

  if (meta.type === 'channelList' || meta.type === 'roleList') {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) throw new Error('Liste d’identifiants attendue.');
    const ids = [...new Set(value.map((id) => String(id)))];
    if (ids.length > (meta.maxItems ?? 100)) throw new Error('Trop d’éléments dans la liste.');
    if (!ids.every((id) => SNOWFLAKE.test(id))) throw new Error('Identifiant Discord invalide dans la liste.');
    return ids;
  }

  if (meta.type === 'json') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Objet JSON attendu.');

    if (key === 'warnThresholds') {
      for (const name of ['mute', 'kick', 'ban']) {
        const number = Number(value[name]);
        if (!Number.isInteger(number) || number < 1) throw new Error(`Seuil ${name} invalide (entier ≥ 1).`);
      }
    }

    if (key === 'automodSettings') {
      for (const section of ['spam', 'caps', 'mentions', 'links', 'invites', 'wordlist']) {
        if (value[section] !== undefined && (typeof value[section] !== 'object' || Array.isArray(value[section]))) {
          throw new Error(`Section automod ${section} invalide.`);
        }
      }
    }

    if (key === 'logEvents') {
      for (const [category, events] of Object.entries(value)) {
        if (!events || typeof events !== 'object' || Array.isArray(events)) {
          throw new Error(`Catégorie de logs ${category} invalide.`);
        }
        if (Object.values(events).some((enabled) => typeof enabled !== 'boolean')) {
          throw new Error(`Événement non booléen dans ${category}.`);
        }
      }
    }

    if (key === 'logChannelOverrides') {
      for (const [event, channelId] of Object.entries(value)) {
        if (channelId !== null && !SNOWFLAKE.test(String(channelId))) {
          throw new Error(`Override ${event} invalide.`);
        }
      }
    }

    return value;
  }

  return value;
}

let cache = null;
const changeListeners = new Set();

export function onConfigChange(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function notifyConfigChange(patch) {
  for (const listener of [...changeListeners]) {
    try {
      listener(patch);
    } catch (err) {
      console.error(`[alln-utils] config listener: ${err.message}`);
    }
  }
}

export function getConfig() {
  if (cache) return cache;

  const stored = readStore('config', {});
  const merged = structuredClone(DEFAULT_CONFIG);
  for (const key of Object.keys(CONFIG_KEYS)) {
    if (stored[key] !== undefined) merged[key] = stored[key];
  }
  merged.logEvents = mergeLogEvents(LOG_DEFAULTS, stored.logEvents);
  merged.logChannelOverrides = { ...(stored.logChannelOverrides ?? {}) };

  cache = merged;
  writeStore('config', merged);
  return cache;
}

export function saveConfig(patch) {
  const next = { ...getConfig() };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (key in CONFIG_KEYS) next[key] = value;
  }
  if (patch?.logEvents && typeof patch.logEvents === 'object' && !Array.isArray(patch.logEvents)) {
    next.logEvents = mergeLogEvents(LOG_DEFAULTS, patch.logEvents);
  }
  cache = next;
  writeStore('config', next);
  notifyConfigChange(patch ?? {});
  return next;
}

export function setConfigValue(key, value) {
  if (!(key in CONFIG_KEYS)) throw new Error(`Clé de configuration inconnue : ${key}`);
  return saveConfig({ [key]: validateConfigValue(key, value) });
}

export function resetConfigValue(key) {
  if (!(key in CONFIG_KEYS)) throw new Error(`Clé de configuration inconnue : ${key}`);
  return saveConfig({ [key]: cloneDefault(CONFIG_KEYS[key].default) });
}

export function configKeyList() {
  return Object.keys(CONFIG_KEYS);
}

export function describeConfigKey(key) {
  const meta = CONFIG_KEYS[key];
  if (!meta) return null;
  return `${key} (${meta.type}) — ${meta.label} — défaut: ${JSON.stringify(meta.default)}`;
}
