import { PermissionFlagsBits } from 'discord.js';
import { getConfig, setConfigValue } from './config.js';
import { buildEmbed } from './embeds.js';
import { log } from './logger.js';

const LOCK_PERMISSIONS = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false,
};

export async function lockChannel(guild, channelId, reason = 'Raid mode activé') {
  const channel = guild.channels.cache.get(channelId)
    ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.permissionOverwrites) return false;
  await channel.permissionOverwrites.edit(guild.roles.everyone, LOCK_PERMISSIONS, { reason }).catch(() => null);
  return true;
}

export async function unlockChannel(guild, channelId, reason = 'Raid mode désactivé') {
  const channel = guild.channels.cache.get(channelId)
    ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.permissionOverwrites) return false;
  await channel.permissionOverwrites.edit(guild.roles.everyone, {
    SendMessages: null,
    SendMessagesInThreads: null,
    CreatePublicThreads: null,
    CreatePrivateThreads: null,
    AddReactions: null,
  }, { reason }).catch(() => null);
  return true;
}

export function isLockable(channel) {
  return Boolean(channel?.isTextBased?.() && !channel.isThread?.());
}

export async function enableRaidMode(client, guild, { by = null, auto = false, channelIds = null } = {}) {
  const config = getConfig();
  const targets = channelIds ?? config.raidModeLockedChannels ?? [];
  let changed = 0;

  for (const channelId of targets) {
    if (await lockChannel(guild, channelId)) changed += 1;
  }

  setConfigValue('raidModeEnabled', true);

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
  const config = getConfig();
  const targets = config.raidModeLockedChannels ?? [];
  let changed = 0;

  for (const channelId of targets) {
    if (await unlockChannel(guild, channelId)) changed += 1;
  }

  setConfigValue('raidModeEnabled', false);

  await log(client, 'security', 'raidModeDisable', {
    guild,
    fields: [
      { name: 'Salons restaurés', value: String(changed), inline: true },
      { name: 'Par', value: by ? `<@${by}>` : 'système', inline: true },
    ],
  });

  return changed;
}

export async function panic(client, guild, { by }) {
  const config = getConfig();
  const channels = guild.channels.cache.filter(isLockable).map((channel) => channel.id);
  const merged = [...new Set([...(config.raidModeLockedChannels ?? []), ...channels])];

  setConfigValue('raidModeLockedChannels', merged);
  const changed = await enableRaidMode(client, guild, { by, channelIds: merged });

  const owner = await client.users.fetch(guild.ownerId).catch(() => null);
  if (owner) {
    await owner.send({
      embeds: [buildEmbed({
        dark: true,
        title: 'PANIC — Alln UTILS',
        description: `Le mode panique a été déclenché sur **${guild.name}**.`,
        fields: [
          { name: 'Déclenché par', value: by ? `<@${by}>` : 'inconnu', inline: true },
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

export async function lockAllTextChannels(guild) {
  const channels = guild.channels.cache.filter(isLockable);
  let changed = 0;
  for (const channel of channels.values()) {
    if (await lockChannel(guild, channel.id, 'Panic — verrouillage global')) changed += 1;
  }
  return changed;
}

export const RAID_LOCK_PERMISSIONS = LOCK_PERMISSIONS;
export { PermissionFlagsBits };
