import { ChannelType } from 'discord.js';
import { CONFIG_KEYS, configKeyList, validateConfigValue } from '../../config.js';

export const CONFIG_CATEGORIES = [
  {
    id: 'general',
    label: 'Général',
    emoji: '⚙️',
    description: 'Couleurs, footers et apparence des embeds.',
    keys: ['embedColor', 'embedColorDark', 'footer', 'footerDark'],
  },
  {
    id: 'logging',
    label: 'Logs',
    emoji: '📋',
    description: 'Salon principal, événements et overrides.',
    keys: ['logChannelId', 'logEvents', 'logChannelOverrides'],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    emoji: '🔔',
    description: 'Bienvenue et suggestions.',
    keys: ['welcomeChannelId', 'suggestionsChannelId'],
  },
  {
    id: 'roles',
    label: 'Rôles & Permissions',
    emoji: '🎭',
    description: 'Autorole, staff et rôles spéciaux.',
    keys: ['autoroleId', 'staffRoleId', 'ticketStaffRoleId', 'premiumRoleId'],
  },
  {
    id: 'rules',
    label: 'Règlement',
    emoji: '📜',
    description: 'Salon des règles et vérification.',
    keys: ['rulesChannelId', 'verifiedRoleId', 'unverifiedRoleId'],
  },
  {
    id: 'tickets',
    label: 'Tickets',
    emoji: '🎫',
    description: 'Catégorie, logs, transcripts et limite.',
    keys: ['ticketCategoryId', 'ticketLogChannelId', 'ticketTranscriptChannelId', 'ticketLimitPerUser'],
  },
  {
    id: 'moderation',
    label: 'Modération',
    emoji: '🛡️',
    description: 'Seuils de warns et sanctions.',
    keys: ['warnThresholds'],
  },
  {
    id: 'automod',
    label: 'Auto-modération',
    emoji: '🤖',
    description: 'Spam, caps, mentions, liens et invitations.',
    keys: ['automodSettings'],
  },
  {
    id: 'antiraid',
    label: 'Anti-Raid',
    emoji: '🚨',
    description: 'Piège texte et verrouillage raid mode.',
    keys: [
      'raidTrapChannelId',
      'raidTrapEnabled',
      'raidTrapBanReason',
      'raidTrapWhitelist',
      'raidModeEnabled',
      'raidModeLockedChannels',
    ],
  },
  {
    id: 'membercount',
    label: 'Compteur membres',
    emoji: '👥',
    description: 'Salon vocal h24 et template du nom.',
    keys: [
      'memberCountChannelId',
      'memberCountTemplate',
      'memberCountUpdateSeconds',
      'memberCountIncludeBots',
      'memberCountEnabled',
    ],
  },
  {
    id: 'statusrole',
    label: 'Statut → Rôle',
    emoji: '💬',
    description: 'Attribution automatique selon le statut personnalisé.',
    keys: [
      'statusRoleText',
      'statusRoleId',
      'statusRoleEnabled',
      'statusRoleMatchMode',
      'statusRoleExemptRoleIds',
      'statusRoleSweepSeconds',
      'statusRoleLogChanges',
    ],
  },
];

export const CHANNEL_TYPES = {
  logChannelId: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
  welcomeChannelId: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
  suggestionsChannelId: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
  rulesChannelId: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
  ticketCategoryId: [ChannelType.GuildCategory],
  ticketLogChannelId: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
  ticketTranscriptChannelId: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
  raidTrapChannelId: [ChannelType.GuildText],
  raidModeLockedChannels: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
  memberCountChannelId: [ChannelType.GuildVoice],
};

const TYPE_ICONS = {
  bool: '🟢',
  channel: '#️⃣',
  role: '🎭',
  channelList: '📚',
  roleList: '📚',
  int: '🔢',
  string: '📝',
  hex: '🎨',
  json: '🧩',
};

const TYPE_LABELS = {
  bool: 'Booléen (activé / désactivé)',
  channel: 'Salon Discord',
  role: 'Rôle Discord',
  channelList: 'Liste de salons',
  roleList: 'Liste de rôles',
  int: 'Nombre entier',
  string: 'Texte',
  hex: 'Couleur hexadécimale',
  json: 'Objet JSON',
};

export function categoryById(categoryId) {
  return CONFIG_CATEGORIES.find((category) => category.id === categoryId) ?? null;
}

export function keysForCategory(categoryId) {
  const category = categoryById(categoryId);
  if (!category) return [];
  return category.keys.filter((key) => key in CONFIG_KEYS);
}

export function keyMeta(key) {
  return CONFIG_KEYS[key] ?? null;
}

export function channelTypesFor(key) {
  return CHANNEL_TYPES[key] ?? null;
}

export function isListType(type) {
  return type === 'channelList' || type === 'roleList';
}

export function isSelectType(type) {
  return ['channel', 'role', 'channelList', 'roleList'].includes(type);
}

export function isModalType(type) {
  return ['int', 'string', 'hex', 'json'].includes(type);
}

export function typeIcon(key) {
  return TYPE_ICONS[CONFIG_KEYS[key]?.type] ?? '⚙️';
}

export function typeLabel(key) {
  return TYPE_LABELS[CONFIG_KEYS[key]?.type] ?? 'Réglage';
}

export function displayValue(key, value) {
  const meta = CONFIG_KEYS[key];
  if (!meta) return '`inconnu`';
  if (value === null || value === undefined) return '`non défini`';

  if (meta.type === 'channel') return `<#${value}>`;
  if (meta.type === 'role') return `<@&${value}>`;
  if (meta.type === 'channelList') {
    return value.length ? value.map((id) => `<#${id}>`).join(' ') : '`aucun`';
  }
  if (meta.type === 'roleList') {
    return value.length ? value.map((id) => `<@&${id}>`).join(' ') : '`aucun`';
  }
  if (meta.type === 'bool') return value ? '🟢 Activé' : '🔴 Désactivé';
  if (meta.type === 'int' || meta.type === 'hex') return `\`${value}\``;
  if (meta.type === 'string') return value ? `\`${String(value).slice(0, 300)}\`` : '`non défini`';

  if (meta.type === 'json') {
    if (key === 'logEvents') {
      const events = Object.values(value ?? {}).flatMap((list) => Object.values(list ?? {}));
      const active = events.filter((enabled) => enabled !== false).length;
      return `🟢 ${active}/${events.length} événements actifs`;
    }
    if (key === 'logChannelOverrides') {
      return `\`${Object.keys(value ?? {}).length}\` override(s)`;
    }
    if (key === 'warnThresholds') {
      return `Mute \`${value.mute ?? 3}\` · Kick \`${value.kick ?? 5}\` · Ban \`${value.ban ?? 7}\``;
    }
    if (key === 'automodSettings') {
      const spam = value.spam ?? {};
      const caps = value.caps ?? {};
      const mentions = value.mentions ?? {};
      const links = value.links ?? {};
      return [
        `Spam \`${spam.count ?? 5}/${spam.window ?? 10}s\``,
        `Caps \`${caps.percent ?? 70}%\``,
        `Mentions \`${mentions.max ?? 5}\``,
        `Liens \`${links.minLevel ?? 0}j\``,
      ].join(' · ');
    }
    return `\`${JSON.stringify(value).slice(0, 300)}\``;
  }

  return `\`${String(value).slice(0, 300)}\``;
}

export function valuePreview(key, value) {
  return displayValue(key, value)
    .replace(/[`*_~|]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 100) || 'Non défini';
}

export function constraintsText(key) {
  const meta = CONFIG_KEYS[key];
  if (!meta) return 'Réglage inconnu.';
  if (meta.type === 'int') {
    const min = meta.min ?? 0;
    const max = meta.max ?? '∞';
    return `Entier entre \`${min}\` et \`${max}\`.`;
  }
  if (meta.type === 'string') return `Texte, maximum \`${meta.maxLength ?? 1000}\` caractères.`;
  if (meta.type === 'hex') return 'Couleur hexadécimale, par exemple `#000000`.';
  if (meta.type === 'json') return 'Objet JSON valide (accolades obligatoires).';
  if (meta.type === 'bool') return 'Active ou désactive le réglage.';
  if (meta.type === 'channel') {
    const types = channelTypesFor(key);
    if (types?.includes(ChannelType.GuildVoice)) return 'Salon vocal uniquement.';
    if (types?.includes(ChannelType.GuildCategory)) return 'Catégorie uniquement.';
    return 'Salon textuel ou annonce.';
  }
  if (meta.type === 'role') return 'Rôle Discord.';
  if (meta.type === 'channelList') return 'Sélection multiple de salons.';
  if (meta.type === 'roleList') return 'Sélection multiple de rôles.';
  return 'Valeur Discord.';
}

export function formatLogValue(value) {
  if (value === null || value === undefined) return '`non défini`';
  if (typeof value === 'object') return `\`${JSON.stringify(value).slice(0, 1000)}\``;
  return `\`${String(value).slice(0, 1000)}\``;
}

export function isDefaultValue(key, value) {
  const meta = CONFIG_KEYS[key];
  if (!meta) return false;
  return JSON.stringify(value) === JSON.stringify(meta.default);
}

export function parseModalValue(key, raw) {
  const meta = CONFIG_KEYS[key];
  if (!meta) throw new Error('Clé de configuration inconnue.');
  const input = String(raw ?? '').trim();

  if (meta.type === 'bool') {
    const normalized = input.toLowerCase();
    if (['true', '1', 'on', 'oui', 'yes', 'activer'].includes(normalized)) return true;
    if (['false', '0', 'off', 'non', 'no', 'desactiver', 'désactiver'].includes(normalized)) return false;
    throw new Error('Valeur attendue : oui ou non.');
  }

  if (meta.type === 'int') {
    if (!/^-?\d+$/.test(input)) throw new Error('Nombre entier attendu.');
    return validateConfigValue(key, Number(input));
  }

  if (meta.type === 'hex') {
    return validateConfigValue(key, input);
  }

  if (meta.type === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(input);
    } catch (err) {
      throw new Error(`JSON invalide : ${err.message}`);
    }
    return validateConfigValue(key, parsed);
  }

  return validateConfigValue(key, input);
}

export function unmappedConfigKeys() {
  const mapped = new Set(CONFIG_CATEGORIES.flatMap((category) => category.keys));
  return configKeyList().filter((key) => !mapped.has(key));
}

export function orphanCategoryKeys() {
  return CONFIG_CATEGORIES.flatMap((category) =>
    category.keys.filter((key) => !(key in CONFIG_KEYS)).map((key) => `${category.id}.${key}`),
  );
}

const missing = unmappedConfigKeys();
if (missing.length > 0) {
  console.warn(`[alln-utils] clés de config non exposées dans /config : ${missing.join(', ')}`);
}
