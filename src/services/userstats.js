import { addUserVoice, incrementUserMessages } from '../db.js';

const voiceSessions = new Map();

function keyOf(guildId, userId) {
  return `${guildId}:${userId}`;
}

export function handleStatsMessage(message) {
  if (!message.guild || message.author?.bot) return null;
  return incrementUserMessages(message.author.id);
}

function flushSession(guildId, userId) {
  const key = keyOf(guildId, userId);
  const startedAt = voiceSessions.get(key);
  if (!startedAt) return 0;
  voiceSessions.delete(key);
  const elapsed = Date.now() - startedAt;
  if (elapsed > 0) addUserVoice(userId, elapsed);
  return elapsed;
}

export function handleStatsVoice(client, oldState, newState) {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return null;

  const guildId = newState.guild?.id ?? oldState.guild?.id;
  if (!guildId) return null;
  const userId = member.id;
  const key = keyOf(guildId, userId);

  const wasIn = Boolean(oldState.channelId);
  const isIn = Boolean(newState.channelId);

  if (!wasIn && isIn) {
    voiceSessions.set(key, Date.now());
    return null;
  }

  if (wasIn && !isIn) {
    return flushSession(guildId, userId);
  }

  if (wasIn && isIn && oldState.channelId !== newState.channelId) {
    flushSession(guildId, userId);
    voiceSessions.set(key, Date.now());
  }

  return null;
}

export function startUserStatsService(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const state of guild.voiceStates.cache.values()) {
      if (!state.channelId || state.member?.user?.bot) continue;
      voiceSessions.set(keyOf(guild.id, state.id), Date.now());
    }
  }
}

export function stopUserStatsService() {
  for (const [key, startedAt] of voiceSessions.entries()) {
    const [guildId, userId] = key.split(':');
    const elapsed = Date.now() - startedAt;
    if (elapsed > 0) addUserVoice(userId, elapsed);
    voiceSessions.delete(key);
  }
}
