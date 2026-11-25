import { ChannelType, Events } from 'discord.js';
import { getConfig } from './config.js';
import { log } from './logger.js';
import { ensureInChannel, isInChannel } from './voiceManager.js';

const MIN_RENAME_INTERVAL_MS = 120_000;
const RENAME_FAIL_LOG_INTERVAL_MS = 10 * 60 * 1000;
const RECONNECT_CHECK_MS = 60_000;

const state = {
  started: false,
  updateTimer: null,
  reconnectTimer: null,
  lastRenameAt: 0,
  lastRenameFailLogAt: 0,
  wasConnected: false,
  needsReconnectLog: false,
  listeners: [],
};

function renderTemplate(template, guild) {
  const config = getConfig();
  const members = guild.members.cache;
  const humans = members.filter((member) => !member.user.bot).size;
  const count = config.memberCountIncludeBots ? guild.memberCount : humans;
  const online = members.filter((member) => member.presence && member.presence.status !== 'offline').size;
  const boosts = guild.premiumSubscriptionCount ?? 0;

  return String(template ?? '👥 Membres : {count}')
    .replaceAll('{count}', String(count))
    .replaceAll('{humans}', String(humans))
    .replaceAll('{online}', String(online))
    .replaceAll('{boosts}', String(boosts))
    .slice(0, 100);
}

export async function updateMemberCount(client, { force = false } = {}) {
  const config = getConfig();
  if (!config.memberCountChannelId || !config.memberCountEnabled) return null;

  const guild = client.guilds.cache.first();
  if (!guild) return null;

  const channel = guild.channels.cache.get(config.memberCountChannelId)
    ?? (await guild.channels.fetch(config.memberCountChannelId).catch(() => null));

  if (!channel || channel.type !== ChannelType.GuildVoice) return null;

  const desired = renderTemplate(config.memberCountTemplate, guild);
  if (channel.name === desired) return desired;

  const now = Date.now();
  if (!force && now - state.lastRenameAt < MIN_RENAME_INTERVAL_MS) return null;

  try {
    await channel.setName(desired, 'Compteur de membres');
    state.lastRenameAt = now;
  } catch (err) {
    if (now - state.lastRenameFailLogAt >= RENAME_FAIL_LOG_INTERVAL_MS) {
      state.lastRenameFailLogAt = now;
      await log(client, 'voice', 'memberCountRenameFail', {
        guild,
        description: `Impossible de renommer <#${channel.id}> : ${err.message}`,
        fields: [
          { name: 'Salon', value: `<#${channel.id}>`, inline: true },
          { name: 'Nom visé', value: desired, inline: true },
        ],
      });
    }
  }

  return desired;
}

export async function ensureBotInChannel(client) {
  const config = getConfig();
  if (!config.memberCountChannelId || !config.memberCountEnabled) return false;

  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.get(config.memberCountChannelId)
      ?? (await guild.channels.fetch(config.memberCountChannelId).catch(() => null));

    if (!channel || channel.type !== ChannelType.GuildVoice) continue;

    if (isInChannel(guild, channel.id)) {
      if (!state.wasConnected) {
        state.wasConnected = true;
        if (state.needsReconnectLog) {
          state.needsReconnectLog = false;
          await log(client, 'voice', 'memberCountReconnect', {
            guild,
            description: 'Le bot est de nouveau connecté au salon compteur.',
            fields: [{ name: 'Salon', value: `<#${channel.id}>`, inline: true }],
          });
        }
      }
      return true;
    }

    if (state.wasConnected) {
      state.wasConnected = false;
      state.needsReconnectLog = true;
    }

    const joined = await ensureInChannel(guild, channel.id).catch(() => false);
    if (joined) {
      state.wasConnected = true;
      if (state.needsReconnectLog) {
        state.needsReconnectLog = false;
        await log(client, 'voice', 'memberCountReconnect', {
          guild,
          description: 'Reconnexion au salon compteur après déconnexion.',
          fields: [{ name: 'Salon', value: `<#${channel.id}>`, inline: true }],
        });
      }
      return true;
    }
  }

  return false;
}

function bindListeners(client) {
  const onMemberChange = () => { updateMemberCount(client).catch(() => null); };
  const onPresence = () => {
    if (String(getConfig().memberCountTemplate ?? '').includes('{online}')) {
      updateMemberCount(client).catch(() => null);
    }
  };

  const listeners = [
    [Events.GuildMemberAdd, onMemberChange],
    [Events.GuildMemberRemove, onMemberChange],
    [Events.GuildMemberUpdate, onMemberChange],
    [Events.PresenceUpdate, onPresence],
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

  const config = getConfig();
  if (!config.memberCountEnabled || !config.memberCountChannelId) return false;

  state.started = true;
  bindListeners(client);
  await ensureBotInChannel(client);
  await updateMemberCount(client, { force: true });

  const seconds = Math.max(120, Number(config.memberCountUpdateSeconds) || 300);
  state.updateTimer = setInterval(() => {
    updateMemberCount(client).catch((err) => console.error(`[alln-utils] membercount: ${err.message}`));
  }, seconds * 1000);

  state.reconnectTimer = setInterval(() => {
    ensureBotInChannel(client).catch((err) => console.error(`[alln-utils] membercount reconnect: ${err.message}`));
  }, RECONNECT_CHECK_MS);

  return true;
}

export function stopMemberCountService(client) {
  if (state.updateTimer) clearInterval(state.updateTimer);
  if (state.reconnectTimer) clearInterval(state.reconnectTimer);
  state.updateTimer = null;
  state.reconnectTimer = null;
  state.started = false;
  unbindListeners(client);
}

export async function restartMemberCountService(client) {
  stopMemberCountService(client);
  return startMemberCountService(client);
}

export function memberCountStatus() {
  return {
    started: state.started,
    lastRenameAt: state.lastRenameAt,
    connected: state.wasConnected,
  };
}
