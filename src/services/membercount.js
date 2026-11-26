import { ChannelType, Events } from 'discord.js';
import { getConfig, onConfigChange } from '../config.js';
import { log } from '../logger.js';
import { ensureInChannel, isInChannel, leaveChannel } from './voiceManager.js';

const MIN_RENAME_INTERVAL_MS = 120_000;
const FAIL_LOG_INTERVAL_MS = 10 * 60 * 1000;
const RECONNECT_CHECK_MS = 60_000;

const WATCHED_KEYS = [
  'memberCountEnabled',
  'memberCountChannelId',
  'memberCountTemplate',
  'memberCountUpdateSeconds',
  'memberCountIncludeBots',
];

const state = {
  started: false,
  updateTimer: null,
  reconnectTimer: null,
  listeners: [],
  offConfigChange: null,
  lastRenameAt: 0,
  lastFailLogAt: 0,
  wasConnected: false,
  needsReconnectLog: false,
};

function renderTemplate(template, guild, config) {
  const members = guild.members.cache;
  const humans = members.filter((member) => !member.user.bot).size;
  const count = config.memberCountIncludeBots ? (guild.memberCount || humans) : humans;
  const online = members.filter((member) => member.presence && member.presence.status !== 'offline').size;
  const boosts = guild.premiumSubscriptionCount ?? 0;

  return String(template ?? '👥 Membres : {count}')
    .replaceAll('{count}', String(count))
    .replaceAll('{humans}', String(humans))
    .replaceAll('{online}', String(online))
    .replaceAll('{boosts}', String(boosts))
    .slice(0, 100);
}

async function findGuildAndChannel(client) {
  const config = getConfig();
  if (!config.memberCountEnabled || !config.memberCountChannelId) return null;

  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.get(config.memberCountChannelId)
      ?? (await guild.channels.fetch(config.memberCountChannelId).catch(() => null));
    if (channel?.type === ChannelType.GuildVoice) return { guild, channel };
  }
  return null;
}

function markConnection(connected, guild, channelId) {
  if (connected && !state.wasConnected) {
    state.wasConnected = true;
    if (state.needsReconnectLog) {
      state.needsReconnectLog = false;
      log(null, 'voice', 'memberCountConnect', {
        guild,
        description: 'Le bot est connecté au salon compteur (muet et sourd).',
        fields: [{ name: 'Salon', value: `<#${channelId}>`, inline: true }],
      }).catch(() => null);
    }
  } else if (!connected && state.wasConnected) {
    state.wasConnected = false;
    state.needsReconnectLog = true;
  }
}

export async function updateMemberCount(client, { force = false } = {}) {
  const found = await findGuildAndChannel(client);
  if (!found) return null;

  const { guild, channel } = found;
  const config = getConfig();
  const desired = renderTemplate(config.memberCountTemplate, guild, config);
  if (channel.name === desired) return desired;

  const now = Date.now();
  if (!force && now - state.lastRenameAt < MIN_RENAME_INTERVAL_MS) return null;

  try {
    await channel.setName(desired, 'Compteur de membres');
    state.lastRenameAt = now;
  } catch (err) {
    markConnection(false, guild, channel.id);
    if (now - state.lastFailLogAt >= FAIL_LOG_INTERVAL_MS) {
      state.lastFailLogAt = now;
      await log(client, 'voice', 'memberCountRenameFail', {
        guild,
        description: `Impossible de renommer <#${channel.id}> : ${err.message}`,
        fields: [
          { name: 'Salon', value: `<#${channel.id}>`, inline: true },
          { name: 'Nom visé', value: desired, inline: true },
          { name: 'Erreur', value: String(err.message).slice(0, 1000), inline: false },
        ],
      }).catch(() => null);
    }
  }

  return desired;
}

export async function ensureBotInChannel(client) {
  const found = await findGuildAndChannel(client);
  if (!found) {
    if (state.wasConnected) markConnection(false, null, null);
    return false;
  }

  const { guild, channel } = found;
  if (isInChannel(guild, channel.id)) {
    markConnection(true, guild, channel.id);
    return true;
  }

  markConnection(false, guild, channel.id);
  const joined = await ensureInChannel(guild, channel.id).catch(() => false);
  if (joined) {
    markConnection(true, guild, channel.id);
    if (state.lastFailLogAt === 0) {
      // Première connexion : pas de log de "reconnexion" trompeur.
      state.needsReconnectLog = false;
    }
    await log(client, 'voice', 'memberCountConnect', {
      guild,
      description: 'Connexion au salon compteur (muet et sourd).',
      fields: [
        { name: 'Salon', value: `<#${channel.id}>`, inline: true },
        { name: 'Micro/casque', value: 'coupés', inline: true },
      ],
    }).catch(() => null);
  }
  return joined;
}

function bindListeners(client) {
  const onMemberChange = () => { updateMemberCount(client).catch(() => null); };
  const onVoiceOrPresence = (...args) => {
    const template = String(getConfig().memberCountTemplate ?? '');
    if (template.includes('{online}') || args.length > 0) {
      updateMemberCount(client).catch(() => null);
    }
  };

  const listeners = [
    [Events.GuildMemberAdd, onMemberChange],
    [Events.GuildMemberRemove, onMemberChange],
    [Events.GuildMemberUpdate, onMemberChange],
    [Events.PresenceUpdate, onVoiceOrPresence],
    [Events.VoiceStateUpdate, onVoiceOrPresence],
  ];

  for (const [event, handler] of listeners) {
    client.on(event, handler);
    state.listeners.push([event, handler]);
  }
}

function unbindListeners(client) {
  for (const [event, handler] of state.listeners) client.off(event, handler);
  state.listeners = [];
}

export async function startMemberCountService(client) {
  stopMemberCountService(client);

  state.offConfigChange = onConfigChange((patch) => {
    if (WATCHED_KEYS.some((key) => key in patch)) {
      queueMicrotask(() => { restartMemberCountService(client).catch(() => null); });
    }
  });

  if (!getConfig().memberCountEnabled || !getConfig().memberCountChannelId) return false;

  state.started = true;
  bindListeners(client);
  await ensureBotInChannel(client);
  await updateMemberCount(client, { force: true });

  const seconds = Math.max(120, Number(getConfig().memberCountUpdateSeconds) || 300);
  state.updateTimer = setInterval(() => {
    updateMemberCount(client).catch((err) => console.error(`[alln-utils] membercount: ${err.message}`));
  }, seconds * 1000);

  state.reconnectTimer = setInterval(() => {
    ensureBotInChannel(client).catch((err) => console.error(`[alln-utils] membercount reconnect: ${err.message}`));
  }, RECONNECT_CHECK_MS);

  return true;
}

export async function stopMemberCountService(client) {
  if (state.updateTimer) clearInterval(state.updateTimer);
  if (state.reconnectTimer) clearInterval(state.reconnectTimer);
  state.updateTimer = null;
  state.reconnectTimer = null;
  state.started = false;
  state.lastRenameAt = 0;
  if (client) unbindListeners(client);
  if (state.offConfigChange) state.offConfigChange();
  state.offConfigChange = null;

  if (client) {
    for (const guild of client.guilds.cache.values()) {
      if (isInChannel(guild, getConfig().memberCountChannelId)) {
        await leaveChannel(guild).catch(() => null);
      }
    }
  }
}

export async function restartMemberCountService(client) {
  await stopMemberCountService(client);
  return startMemberCountService(client);
}

export function memberCountStatus() {
  return {
    started: state.started,
    connected: state.wasConnected,
    lastRenameAt: state.lastRenameAt,
  };
}
