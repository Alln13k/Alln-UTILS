import { CONFIG_KEYS } from './config.js';

const HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;
const CLEAR_TOKENS = new Set(['null', 'none', 'clear', 'aucun']);

export function parseId(raw) {
  if (!raw) return null;
  const mention = String(raw).match(/^<[#@&]+(\d+)>$/);
  if (mention) return mention[1];
  return /^\d{15,25}$/.test(String(raw)) ? String(raw) : null;
}

export async function parseValue(guild, key, raw) {
  const meta = CONFIG_KEYS[key];
  if (!meta) throw new Error(`clé inconnue: ${key}`);

  const value = String(raw ?? '').trim();

  if (!value) {
    if (meta.type.endsWith('List')) return [];
    if (['channel', 'role', 'string', 'hex'].includes(meta.type)) return null;
    throw new Error('valeur requise');
  }

  if (CLEAR_TOKENS.has(value.toLowerCase())) {
    if (meta.type.endsWith('List')) return [];
    if (['channel', 'role', 'string', 'hex'].includes(meta.type)) return null;
  }

  switch (meta.type) {
    case 'hex': {
      if (!HEX_PATTERN.test(value)) throw new Error('hex invalide, attendu #000000');
      return value.startsWith('#') ? value.toLowerCase() : `#${value.toLowerCase()}`;
    }
    case 'bool': {
      if (!['true', 'false', 'on', 'off', 'oui', 'non'].includes(value.toLowerCase())) {
        throw new Error('booléen invalide (true/false)');
      }
      return ['true', 'on', 'oui'].includes(value.toLowerCase());
    }
    case 'int': {
      const number = Number.parseInt(value, 10);
      if (!Number.isFinite(number)) throw new Error('entier invalide');
      if (meta.min !== undefined && number < meta.min) throw new Error(`minimum ${meta.min}`);
      if (meta.max !== undefined && number > meta.max) throw new Error(`maximum ${meta.max}`);
      return number;
    }
    case 'channel': {
      const id = parseId(value);
      if (!guild) throw new Error('serveur introuvable');
      const channel = id ? await guild.channels.fetch(id).catch(() => null) : null;
      if (!channel) throw new Error('salon introuvable');
      return channel.id;
    }
    case 'role': {
      const id = parseId(value);
      if (!guild) throw new Error('serveur introuvable');
      const role = id ? await guild.roles.fetch(id).catch(() => null) : null;
      if (!role) throw new Error('rôle introuvable');
      return role.id;
    }
    case 'channelList': {
      const parts = value.split(/[\s,]+/).filter(Boolean);
      if (!guild) throw new Error('serveur introuvable');
      const ids = [];
      for (const part of parts) {
        const id = parseId(part);
        const channel = id ? await guild.channels.fetch(id).catch(() => null) : null;
        if (!channel) throw new Error(`salon introuvable: ${part}`);
        ids.push(channel.id);
      }
      return ids;
    }
    case 'roleList': {
      const parts = value.split(/[\s,]+/).filter(Boolean);
      if (!guild) throw new Error('serveur introuvable');
      const ids = [];
      for (const part of parts) {
        const id = parseId(part);
        const role = id ? await guild.roles.fetch(id).catch(() => null) : null;
        if (!role) throw new Error(`rôle introuvable: ${part}`);
        ids.push(role.id);
      }
      return ids;
    }
    case 'json': {
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new Error('JSON invalide');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON objet attendu');
      }
      return parsed;
    }
    default:
      return value;
  }
}

export function displayConfigValue(key, value, options = {}) {
  const meta = CONFIG_KEYS[key];
  if (value === null || value === undefined) return 'non défini';
  if (meta?.type === 'channel') return `<#${value}>`;
  if (meta?.type === 'role') return `<@&${value}>`;
  if (meta?.type === 'channelList') return value.length ? value.map((id) => `<#${id}>`).join(', ') : 'aucun';
  if (meta?.type === 'roleList') return value.length ? value.map((id) => `<@&${id}>`).join(', ') : 'aucun';
  if (meta?.type === 'json') {
    const json = JSON.stringify(value, null, options.prettyJson ? 2 : 0);
    return options.prettyJson ? `\`\`\`json\n${json.slice(0, 900)}\n\`\`\`` : json;
  }
  return String(value);
}

export function encodeConfigValue(key, value) {
  const meta = CONFIG_KEYS[key];
  if (value === null || value === undefined) return '';
  if (meta?.type === 'json') return JSON.stringify(value);
  if (meta?.type === 'channelList' || meta?.type === 'roleList') return value.join(', ');
  return String(value);
}

export function configValueHint(key) {
  const meta = CONFIG_KEYS[key];
  if (!meta) return '';
  switch (meta.type) {
    case 'hex': return 'Hex à 6 chiffres (`#000000`). Laisse vide pour effacer.';
    case 'bool': return '`true` / `false` (ou `oui` / `non`).';
    case 'int': {
      const bounds = [];
      if (meta.min !== undefined) bounds.push(`min ${meta.min}`);
      if (meta.max !== undefined) bounds.push(`max ${meta.max}`);
      return `Entier${bounds.length ? ` (${bounds.join(', ')})` : ''}.`;
    }
    case 'channel': return 'Mention ou ID du salon. Laisse vide pour effacer.';
    case 'role': return 'Mention ou ID du rôle. Laisse vide pour effacer.';
    case 'channelList': return 'Salons séparés par des virgules. Laisse vide pour vider la liste.';
    case 'roleList': return 'Rôles séparés par des virgules. Laisse vide pour vider la liste.';
    case 'json': return 'Objet JSON valide (ex. `{}`).';
    default: return 'Texte libre. Laisse vide pour effacer.';
  }
}
