import { getConfig, saveConfig } from './config.js';
import { LOG_DEFAULTS, LOG_TITLES } from './logDefaults.js';
import { buildEmbed } from './embeds.js';
import { readStore } from './store.js';

function mergeEvents(base, patch) {
  const out = {};
  const categories = new Set([...Object.keys(base ?? {}), ...Object.keys(patch ?? {})]);
  for (const category of categories) {
    out[category] = { ...(base[category] ?? {}), ...(patch?.[category] ?? {}) };
  }
  return out;
}

function currentLogEvents() {
  const stored = readStore('config', {});
  return mergeEvents(LOG_DEFAULTS, stored.logEvents);
}

export function logKey(category, event) {
  return `${category}.${event}`;
}

export function getLogEvents() {
  return currentLogEvents();
}

export function logCategories() {
  return Object.keys(currentLogEvents());
}

export function logEventsFor(category) {
  return currentLogEvents()[category] ?? null;
}

export function isLogEnabled(category, event) {
  const events = currentLogEvents();
  return events?.[category]?.[event] !== false;
}

export function countActiveLogs(category = null) {
  const events = currentLogEvents();
  let active = 0;
  let total = 0;
  for (const [cat, list] of Object.entries(events)) {
    if (category && cat !== category) continue;
    for (const value of Object.values(list)) {
      total += 1;
      if (value !== false) active += 1;
    }
  }
  return { active, total };
}

export function setLogEvent(category, event, enabled) {
  const events = structuredClone(currentLogEvents());
  if (!events[category] || !(event in events[category])) {
    throw new Error(`événement inconnu: ${category}.${event}`);
  }
  events[category][event] = Boolean(enabled);
  saveConfig({ logEvents: events });
  return events[category][event];
}

export function setLogCategory(category, enabled) {
  const events = structuredClone(currentLogEvents());
  if (!events[category]) throw new Error(`catégorie inconnue: ${category}`);
  for (const event of Object.keys(events[category])) events[category][event] = Boolean(enabled);
  saveConfig({ logEvents: events });
  return Object.keys(events[category]).length;
}

export function muteAllLogs() {
  const events = structuredClone(currentLogEvents());
  for (const [category, list] of Object.entries(events)) {
    if (category === 'admin' || category === 'security') continue;
    for (const event of Object.keys(list)) list[event] = false;
  }
  saveConfig({ logEvents: events });
}

export function unmuteAllLogs() {
  const events = structuredClone(currentLogEvents());
  for (const list of Object.values(events)) {
    for (const event of Object.keys(list)) list[event] = true;
  }
  saveConfig({ logEvents: events });
}

export function setLogOverride(category, event, channelId) {
  const config = getConfig();
  const overrides = { ...(config.logChannelOverrides ?? {}) };
  overrides[logKey(category, event)] = channelId;
  saveConfig({ logChannelOverrides: overrides });
}

export function clearLogOverride(category, event) {
  const config = getConfig();
  const overrides = { ...(config.logChannelOverrides ?? {}) };
  delete overrides[logKey(category, event)];
  delete overrides[event];
  saveConfig({ logChannelOverrides: overrides });
}

export function listLogOverrides() {
  return { ...(getConfig().logChannelOverrides ?? {}) };
}

function resolveChannelId(category, event) {
  const config = getConfig();
  const overrides = config.logChannelOverrides ?? {};
  const override = overrides[logKey(category, event)] ?? overrides[event] ?? null;
  if (override) return override;
  if (category === 'tickets' && config.ticketLogChannelId) return config.ticketLogChannelId;
  return config.logChannelId ?? null;
}

export async function log(client, category, event, payload = {}) {
  try {
    if (!isLogEnabled(category, event)) return null;

    const guild = payload.guild ?? null;
    if (!guild) return null;

    const config = getConfig();
    const channelId = payload.channelIdOverride ?? resolveChannelId(category, event);
    if (!channelId || channelId === config.raidTrapChannelId) return null;

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return null;

    const audit = category === 'admin' || category === 'security';
    const embed = buildEmbed({
      dark: true,
      title: payload.title ?? LOG_TITLES[logKey(category, event)] ?? `${category} — ${event}`,
      description: payload.description,
      fields: payload.fields,
      footer: audit ? 'Alln UTILS // audit' : undefined,
    });

    const body = { embeds: [embed] };
    if (payload.content) body.content = payload.content;
    if (payload.allowedMentions) body.allowedMentions = payload.allowedMentions;
    if (payload.files) body.files = payload.files;

    return await channel.send(body);
  } catch (err) {
    console.error(`[alln-utils] log ${category}.${event}: ${err.message}`);
    return null;
  }
}

export async function sendToChannel(guild, channelId, payload) {
  if (!guild || !channelId) return null;
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return null;
    return await channel.send(payload);
  } catch (err) {
    console.error(`[alln-utils] envoi vers ${channelId}: ${err.message}`);
    return null;
  }
}

export { LOG_DEFAULTS };
