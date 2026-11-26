import { PermissionFlagsBits } from 'discord.js';
import { getConfig, setConfigValue } from './config.js';
import { buildEmbed } from './embeds.js';
import { getSecurityState, saveSecurityState } from './db.js';
import { log } from './logger.js';

const LOCK_KEYS = [
  'SendMessages',
  'SendMessagesInThreads',
  'CreatePublicThreads',
  'CreatePrivateThreads',
  'AddReactions',
];

const LOCK_PERMISSIONS = Object.fromEntries(LOCK_KEYS.map((key) => [key, false]));

export function isLockable(channel) {
  return Boolean(channel?.isTextBased?.() && !channel.isThread?.());
}

function snapshotOverwrite(channel) {
  const overwrite = channel.permissionOverwrites?.cache?.get(channel.guild.roles.everyone.id);
  if (!overwrite) return Object.fromEntries(LOCK_KEYS.map((key) => [key, null]));

  return Object.fromEntries(LOCK_KEYS.map((key) => {
    const bit = PermissionFlagsBits[key];
    if (overwrite.deny?.has(bit)) return [key, false];
    if (overwrite.allow?.has(bit)) return [key, true];
    return [key, null];
  }));
}

function restoreFromSnapshot(snapshot) {
  return Object.fromEntries(LOCK_KEYS.map((key) => [key, snapshot?.[key] ?? null]));
}

function saveSnapshots(patches) {
  if (Object.keys(patches).length === 0) return;
  const state = getSecurityState();
  saveSecurityState({
    raidModeOverwrites: { ...(state.raidModeOverwrites ?? {}), ...patches },
  });
}

function takeSnapshots(channelIds) {
  const state = getSecurityState();
  return { ...(state.raidModeOverwrites ?? {}) };
}

export async function lockChannel(guild, channelId, reason = 'Raid mode activé') {
  const channel = guild.channels.cache.get(channelId)
    ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!isLockable(channel)) return false;

  const snapshots = takeSnapshots();
  if (!snapshots[channelId]) snapshots[channelId] = snapshotOverwrite(channel);
  saveSnapshots({ [channelId]: snapshots[channelId] });

  await channel.permissionOverwrites
    .edit(guild.roles.everyone, LOCK_PERMISSIONS, { reason })
    .catch(() => null);
  return true;
}

export async function unlockChannel(guild, channelId, reason = 'Raid mode désactivé') {
  const channel = guild.channels.cache.get(channelId)
    ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!isLockable(channel)) return false;

  const snapshot = takeSnapshots()[channelId];
  await channel.permissionOverwrites
    .edit(guild.roles.everyone, restoreFromSnapshot(snapshot), { reason })
    .catch(() => null);

  const snapshots = takeSnapshots();
  delete snapshots[channelId];
  saveSecurityState({ raidModeOverwrites: snapshots });
  return true;
}

export async function enableRaidMode(client, guild, { by = null, auto = false, channelIds = null } = {}) {
  const config = getConfig();
  const targets = channelIds ?? config.raidModeLockedChannels ?? [];
  let changed = 0;

  for (const channelId of targets) {
    if (await lockChannel(guild, channelId)) changed += 1;
  }

  await setConfigValue('raidModeEnabled', true);

  await log(client, 'security', 'raidModeEnable', {
    guild,
    title: auto ? 'Raid mode activé automatiquement' : 'Raid mode activé',
    description: auto
      ? 'Détection de joins massifs : le serveur a été verrouillé automatiquement.'
      : null,
    fields: [
      { name: 'Salons verrouillés', value: String(changed), inline: true },
      { name: 'Déclencheur', value: by ? `<@${by}>` : 'automatique', inline: true },
    ],
  });

  return changed;
}

export async function disableRaidMode(client, guild, { by = null } = {}) {
  const targets = getConfig().raidModeLockedChannels ?? [];
  let changed = 0;

  for (const channelId of targets) {
    if (await unlockChannel(guild, channelId)) changed += 1;
  }

  await setConfigValue('raidModeEnabled', false);

  await log(client, 'security', 'raidModeDisable', {
    guild,
    fields: [
      { name: 'Salons restaurés', value: String(changed), inline: true },
      { name: 'Par', value: by ? `<@${by}>` : 'système', inline: true },
    ],
  });

  return changed;
}

export async function panic(client, guild, { by = null } = {}) {
  const config = getConfig();
  const channels = guild.channels.cache.filter(isLockable).map((channel) => channel.id);
  const merged = [...new Set([...(config.raidModeLockedChannels ?? []), ...channels])];

  await setConfigValue('raidModeLockedChannels', merged);
  const changed = await enableRaidMode(client, guild, { by, channelIds: merged });

  const owner = await client.users.fetch(guild.ownerId).catch(() => null);
  if (owner) {
    await owner.send({
      embeds: [buildEmbed({
        dark: true,
        title: 'PANIC — Alln UTILS',
        description: `Le mode panique a été déclenché sur **${guild.name}**.`,
        fields: [
          { name: 'Déclencheur', value: by ? `<@${by}>` : 'inconnu', inline: true },
          { name: 'Salons verrouillés', value: String(changed), inline: true },
          { name: 'Horodatage', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
        ],
      })],
    }).catch(() => null);
  }

  await log(client, 'security', 'panic', {
    guild,
    title: 'PANIC — serveur verrouillé',
    description: `Mode panique déclenché par <@${by ?? '0'}>. Tous les salons textuels sont verrouillés.`,
    content: config.staffRoleId ? `<@&${config.staffRoleId}>` : undefined,
    allowedMentions: config.staffRoleId ? { roles: [config.staffRoleId] } : { parse: [] },
    fields: [
      { name: 'Déclencheur', value: by ? `<@${by}>` : 'inconnu', inline: true },
      { name: 'Salons verrouillés', value: String(changed), inline: true },
      { name: 'Owner notifié', value: owner ? 'oui' : 'non', inline: true },
    ],
  });

  return changed;
}
