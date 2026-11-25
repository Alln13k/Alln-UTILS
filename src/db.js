import { readStore, writeStore } from './store.js';
import { DEFAULT_CONFIG } from './config.js';

const SEED_CATEGORIES = [
  { name: 'rat', emoji: '🐀' },
  { name: 'stealer', emoji: '🧲' },
  { name: 'cheat', emoji: '🎯' },
  { name: 'esp', emoji: '👁️' },
  { name: 'exploit', emoji: '💥' },
  { name: 'autre', emoji: '📦' },
];

const EMPTY = {
  tools: { items: {} },
  vouchs: { items: {} },
  premium: { items: {} },
  blacklist: { items: {} },
  gates: { items: {} },
  categories: { items: [] },
  tickets: { nextId: 1, items: {} },
  stats: { leaksPublished: 0, createdAt: new Date().toISOString() },
  giveaways: { nextId: 1, items: {} },
  reactionroles: { items: [] },
  buttonroles: { items: [], users: {} },
  warns: { items: {} },
  levels: { users: {}, tiers: {} },
  invites: { records: [], counts: {} },
  suggestions: { nextId: 1, items: {} },
  polls: { nextId: 1, items: {} },
  schedule: { nextId: 1, items: {} },
  notes: { items: {} },
  reminders: { nextId: 1, items: {} },
  starboard: { items: {} },
  automod: { wordlist: [] },
  customcmds: { items: {} },
  security: { joinTimes: [] },
  bumps: { counts: {}, lastBumpAt: null, nextReminderAt: null },
  tempvoice: { items: {} },
  reports: { nextId: 1, items: {} },
  temproles: { items: [] },
  payments: { items: [] },
  pinpanels: { items: {} },
  userstats: { messages: {}, voice: {} },
  announcements: { items: {} },
  escrow: { nextId: 1, items: {} },
};

export function initDb() {
  readStore('config', DEFAULT_CONFIG);
  for (const [name, fallback] of Object.entries(EMPTY)) {
    if (name === 'categories') continue;
    readStore(name, fallback);
  }

  const categories = readStore('categories', EMPTY.categories);
  if (!Array.isArray(categories.items) || categories.items.length === 0) {
    writeStore('categories', { items: SEED_CATEGORIES.map((c) => ({ ...c, builtin: true })) });
  }
}

const keyOf = (name) => String(name).trim().toLowerCase();

export function sanitizeSlug(name) {
  return keyOf(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
}

export function listCategories() {
  return readStore('categories', EMPTY.categories).items;
}

export function addCategory(name, emoji) {
  const slug = keyOf(name);
  if (!slug) throw new Error('nom invalide');
  const store = readStore('categories', EMPTY.categories);
  if (store.items.some((c) => keyOf(c.name) === slug)) throw new Error('catégorie déjà existante');
  store.items.push({ name: slug, emoji: emoji || '📦' });
  writeStore('categories', store);
  return store.items.at(-1);
}

export function removeCategory(name) {
  const slug = keyOf(name);
  const store = readStore('categories', EMPTY.categories);
  const before = store.items.length;
  store.items = store.items.filter((c) => keyOf(c.name) !== slug);
  if (store.items.length === before) throw new Error('catégorie introuvable');
  writeStore('categories', store);
  return true;
}

export function findCategory(name) {
  const slug = keyOf(name);
  return listCategories().find((c) => keyOf(c.name) === slug) ?? null;
}

export function listTools() {
  return Object.values(readStore('tools', EMPTY.tools).items);
}

export function getTool(name) {
  return readStore('tools', EMPTY.tools).items[keyOf(name)] ?? null;
}

export function addTool(tool) {
  const slug = keyOf(tool.name);
  if (!slug) throw new Error('nom invalide');
  const store = readStore('tools', EMPTY.tools);
  if (store.items[slug]) throw new Error('tool déjà existante');
  store.items[slug] = {
    slug,
    name: tool.name.trim(),
    description: tool.description,
    category: keyOf(tool.category),
    link: tool.link ?? null,
    version: tool.version ?? null,
    price: tool.price ?? null,
    addedBy: tool.addedBy,
    addedAt: new Date().toISOString(),
  };
  writeStore('tools', store);
  return store.items[slug];
}

export function editTool(name, patch) {
  const slug = keyOf(name);
  const store = readStore('tools', EMPTY.tools);
  const tool = store.items[slug];
  if (!tool) throw new Error('tool introuvable');
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') continue;
    tool[key] = key === 'category' ? keyOf(value) : value;
  }
  tool.updatedAt = new Date().toISOString();
  writeStore('tools', store);
  return tool;
}

export function removeTool(name) {
  const slug = keyOf(name);
  const store = readStore('tools', EMPTY.tools);
  if (!store.items[slug]) throw new Error('tool introuvable');
  delete store.items[slug];
  writeStore('tools', store);
  return true;
}

export function listVouchs(toolName) {
  return readStore('vouchs', EMPTY.vouchs).items[keyOf(toolName)] ?? [];
}

export function hasVouched(toolName, userId) {
  return listVouchs(toolName).some((v) => v.userId === userId);
}

export function addVouch(toolName, vouch) {
  const slug = keyOf(toolName);
  const store = readStore('vouchs', EMPTY.vouchs);
  const list = store.items[slug] ?? [];
  if (list.some((v) => v.userId === vouch.userId)) throw new Error('tu as déjà vouché cette tool');
  list.push({ ...vouch, createdAt: new Date().toISOString() });
  store.items[slug] = list;
  writeStore('vouchs', store);
  return list.at(-1);
}

export function averageNote(toolName) {
  const list = listVouchs(toolName);
  if (list.length === 0) return null;
  const total = list.reduce((sum, v) => sum + Number(v.note || 0), 0);
  return Math.round((total / list.length) * 100) / 100;
}

export function vouchsGiven(userId) {
  const store = readStore('vouchs', EMPTY.vouchs);
  return Object.values(store.items).flat().filter((v) => v.userId === userId);
}

export function vouchsReceived(userId) {
  const tools = listTools().filter((t) => t.addedBy === userId);
  const store = readStore('vouchs', EMPTY.vouchs);
  return tools.flatMap((t) => store.items[t.slug] ?? []);
}

export function totalVouchs() {
  const store = readStore('vouchs', EMPTY.vouchs);
  return Object.values(store.items).reduce((sum, list) => sum + list.length, 0);
}

export function listPremium() {
  return Object.entries(readStore('premium', EMPTY.premium).items).map(([userId, data]) => ({ userId, ...data }));
}

export function getPremium(userId) {
  return readStore('premium', EMPTY.premium).items[userId] ?? null;
}

export function grantPremium(userId, expiresAt, grantedBy) {
  const store = readStore('premium', EMPTY.premium);
  store.items[userId] = { expiresAt, grantedBy, grantedAt: new Date().toISOString() };
  writeStore('premium', store);
  return store.items[userId];
}

export function revokePremium(userId) {
  const store = readStore('premium', EMPTY.premium);
  if (!store.items[userId]) throw new Error('aucun premium pour cet utilisateur');
  delete store.items[userId];
  writeStore('premium', store);
  return true;
}

export function removeExpiredPremiums(now = Date.now()) {
  const store = readStore('premium', EMPTY.premium);
  const expired = [];

  for (const [userId, data] of Object.entries(store.items)) {
    if (new Date(data.expiresAt).getTime() <= now) {
      expired.push({ userId, ...data });
      delete store.items[userId];
    }
  }

  if (expired.length > 0) writeStore('premium', store);
  return expired;
}

export function listBlacklist() {
  return Object.entries(readStore('blacklist', EMPTY.blacklist).items).map(([userId, data]) => ({ userId, ...data }));
}

export function isBlacklisted(userId) {
  return Boolean(readStore('blacklist', EMPTY.blacklist).items[userId]);
}

export function addBlacklist(userId, reason, addedBy) {
  const store = readStore('blacklist', EMPTY.blacklist);
  store.items[userId] = { reason, addedBy, createdAt: new Date().toISOString() };
  writeStore('blacklist', store);
  return store.items[userId];
}

export function removeBlacklist(userId) {
  const store = readStore('blacklist', EMPTY.blacklist);
  if (!store.items[userId]) throw new Error('utilisateur absent de la blacklist');
  delete store.items[userId];
  writeStore('blacklist', store);
  return true;
}

export function listGates() {
  return Object.values(readStore('gates', EMPTY.gates).items);
}

export function getGate(name) {
  return readStore('gates', EMPTY.gates).items[keyOf(name)] ?? null;
}

export function addGate({ name, roleId, channelId, minLevel, createdBy }) {
  const slug = keyOf(name);
  const store = readStore('gates', EMPTY.gates);
  if (store.items[slug]) throw new Error('gate déjà existant');
  store.items[slug] = {
    slug,
    name,
    roleId,
    channelId: channelId ?? null,
    minLevel: Number(minLevel) || 0,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  writeStore('gates', store);
  return store.items[slug];
}

export function removeGate(name) {
  const slug = keyOf(name);
  const store = readStore('gates', EMPTY.gates);
  if (!store.items[slug]) throw new Error('gate introuvable');
  const gate = store.items[slug];
  delete store.items[slug];
  writeStore('gates', store);
  return gate;
}

export function nextTicketId() {
  const store = readStore('tickets', EMPTY.tickets);
  const id = store.nextId ?? 1;
  store.nextId = id + 1;
  writeStore('tickets', store);
  return id;
}

export function saveTicket(ticket) {
  const store = readStore('tickets', EMPTY.tickets);
  store.items[ticket.channelId] = ticket;
  writeStore('tickets', store);
  return ticket;
}

export function getTicketByChannel(channelId) {
  return readStore('tickets', EMPTY.tickets).items[channelId] ?? null;
}

export function updateTicket(channelId, patch) {
  const store = readStore('tickets', EMPTY.tickets);
  const ticket = store.items[channelId];
  if (!ticket) return null;
  Object.assign(ticket, patch);
  store.items[channelId] = ticket;
  writeStore('tickets', store);
  return ticket;
}

export function listTickets(status = null) {
  const items = Object.values(readStore('tickets', EMPTY.tickets).items);
  return status ? items.filter((t) => t.status === status) : items;
}

export function countOpenTicketsFor(userId) {
  return listTickets('open').filter((t) => t.userId === userId).length
    + listTickets('claimed').filter((t) => t.userId === userId).length;
}

export function incrementTicketMessages(channelId) {
  const store = readStore('tickets', EMPTY.tickets);
  const ticket = store.items[channelId];
  if (!ticket) return null;
  ticket.messageCount = (ticket.messageCount ?? 0) + 1;
  writeStore('tickets', store);
  return ticket.messageCount;
}

export function getStats() {
  return readStore('stats', EMPTY.stats);
}

export function incrementLeaks() {
  const store = readStore('stats', EMPTY.stats);
  store.leaksPublished = (store.leaksPublished ?? 0) + 1;
  writeStore('stats', store);
  return store.leaksPublished;
}

/* ------------------------------- Giveaways ------------------------------- */

export function nextGiveawayId() {
  const store = readStore('giveaways', EMPTY.giveaways);
  const id = store.nextId ?? 1;
  store.nextId = id + 1;
  writeStore('giveaways', store);
  return id;
}

export function saveGiveaway(giveaway) {
  const store = readStore('giveaways', EMPTY.giveaways);
  store.items[String(giveaway.id)] = giveaway;
  writeStore('giveaways', store);
  return giveaway;
}

export function getGiveaway(id) {
  return readStore('giveaways', EMPTY.giveaways).items[String(id)] ?? null;
}

export function updateGiveaway(id, patch) {
  const store = readStore('giveaways', EMPTY.giveaways);
  const giveaway = store.items[String(id)];
  if (!giveaway) return null;
  Object.assign(giveaway, patch);
  store.items[String(id)] = giveaway;
  writeStore('giveaways', store);
  return giveaway;
}

export function deleteGiveaway(id) {
  const store = readStore('giveaways', EMPTY.giveaways);
  const giveaway = store.items[String(id)] ?? null;
  if (!giveaway) return null;
  delete store.items[String(id)];
  writeStore('giveaways', store);
  return giveaway;
}

export function listGiveaways(activeOnly = false) {
  const items = Object.values(readStore('giveaways', EMPTY.giveaways).items);
  return activeOnly ? items.filter((g) => !g.ended) : items;
}

export function addGiveawayParticipant(id, userId) {
  const store = readStore('giveaways', EMPTY.giveaways);
  const giveaway = store.items[String(id)];
  if (!giveaway) return { ok: false, reason: 'Giveaway introuvable.' };
  if (giveaway.ended) return { ok: false, reason: 'Ce giveaway est terminé.' };
  giveaway.participants = giveaway.participants ?? [];
  if (giveaway.participants.includes(userId)) return { ok: false, reason: 'Tu participes déjà à ce giveaway.' };
  giveaway.participants.push(userId);
  writeStore('giveaways', store);
  return { ok: true, giveaway };
}

/* ----------------------------- Reaction roles ---------------------------- */

export function listReactionRoles() {
  return readStore('reactionroles', EMPTY.reactionroles).items;
}

export function addReactionRole(entry) {
  const store = readStore('reactionroles', EMPTY.reactionroles);
  store.items.push(entry);
  writeStore('reactionroles', store);
  return entry;
}

export function removeReactionRole(messageId, emoji) {
  const store = readStore('reactionroles', EMPTY.reactionroles);
  const before = store.items.length;
  store.items = store.items.filter((r) => !(r.messageId === messageId && r.emoji === emoji));
  if (store.items.length === before) throw new Error('réaction-rôle introuvable');
  writeStore('reactionroles', store);
  return true;
}

export function findReactionRoles(messageId) {
  return listReactionRoles().filter((r) => r.messageId === messageId);
}

/* ------------------------------ Button roles ----------------------------- */

export function listButtonRoles() {
  return readStore('buttonroles', EMPTY.buttonroles).items;
}

export function addButtonRole(entry) {
  const store = readStore('buttonroles', EMPTY.buttonroles);
  if (store.items.some((r) => keyOf(r.name) === keyOf(entry.name))) throw new Error('un rôle porte déjà ce nom');
  store.items.push({ ...entry, name: entry.name.trim() });
  writeStore('buttonroles', store);
  return store.items.at(-1);
}

export function removeButtonRole(name) {
  const store = readStore('buttonroles', EMPTY.buttonroles);
  const before = store.items.length;
  store.items = store.items.filter((r) => keyOf(r.name) !== keyOf(name));
  if (store.items.length === before) throw new Error('rôle introuvable');
  writeStore('buttonroles', store);
  return true;
}

export function getButtonRoleChoice(userId) {
  return readStore('buttonroles', EMPTY.buttonroles).users[userId] ?? [];
}

export function setButtonRoleChoice(userId, roleId, add) {
  const store = readStore('buttonroles', EMPTY.buttonroles);
  const list = new Set(store.users[userId] ?? []);
  if (add) list.add(roleId);
  else list.delete(roleId);
  store.users[userId] = [...list];
  writeStore('buttonroles', store);
  return store.users[userId];
}

/* --------------------------------- Warns --------------------------------- */

export function addWarn(userId, warn) {
  const store = readStore('warns', EMPTY.warns);
  const list = store.items[userId] ?? [];
  list.push({ ...warn, createdAt: new Date().toISOString() });
  store.items[userId] = list;
  writeStore('warns', store);
  return list.length;
}

export function listWarns(userId) {
  return readStore('warns', EMPTY.warns).items[userId] ?? [];
}

export function countWarns(userId) {
  return listWarns(userId).length;
}

export function listAllWarns() {
  const store = readStore('warns', EMPTY.warns);
  return Object.entries(store.items ?? {}).flatMap(([userId, warns]) =>
    (warns ?? []).map((warn) => ({ userId, ...warn })));
}

export function clearWarns(userId) {
  const store = readStore('warns', EMPTY.warns);
  const count = (store.items[userId] ?? []).length;
  delete store.items[userId];
  writeStore('warns', store);
  return count;
}

/* --------------------------------- Levels -------------------------------- */

export function getLevelUser(userId) {
  const user = readStore('levels', EMPTY.levels).users[userId] ?? {};
  return { xp: Number(user.xp) || 0, lastMessageAt: Number(user.lastMessageAt) || 0 };
}

export function setLevelUser(userId, patch) {
  const store = readStore('levels', EMPTY.levels);
  store.users[userId] = { ...(store.users[userId] ?? {}), ...patch };
  writeStore('levels', store);
  return store.users[userId];
}

export function addLevelXp(userId, amount, now = Date.now()) {
  const store = readStore('levels', EMPTY.levels);
  const user = store.users[userId] ?? { xp: 0, lastMessageAt: 0 };
  user.xp = (Number(user.xp) || 0) + amount;
  user.lastMessageAt = now;
  store.users[userId] = user;
  writeStore('levels', store);
  return user.xp;
}

export function listLevels() {
  return Object.entries(readStore('levels', EMPTY.levels).users)
    .map(([userId, data]) => ({ userId, xp: Number(data.xp) || 0, lastMessageAt: Number(data.lastMessageAt) || 0 }));
}

export function getLevelTiers() {
  return { ...(readStore('levels', EMPTY.levels).tiers ?? {}) };
}

export function setLevelTier(level, roleId) {
  const store = readStore('levels', EMPTY.levels);
  store.tiers = store.tiers ?? {};
  store.tiers[String(level)] = roleId;
  writeStore('levels', store);
  return store.tiers;
}

export function removeLevelTier(level) {
  const store = readStore('levels', EMPTY.levels);
  store.tiers = store.tiers ?? {};
  delete store.tiers[String(level)];
  writeStore('levels', store);
  return store.tiers;
}

/* -------------------------------- Invites -------------------------------- */

export function getInviteState() {
  const state = readStore('invites', EMPTY.invites);
  return { records: state.records ?? [], counts: state.counts ?? {} };
}

export function saveInviteState(state) {
  writeStore('invites', { records: state.records ?? [], counts: state.counts ?? {} });
  return state;
}

export function addInviteRecord(record) {
  const state = getInviteState();
  state.records.push(record);
  const key = record.inviterId ?? 'unknown';
  state.counts[key] = state.counts[key] ?? { real: 0, fake: 0, leaves: 0 };
  if (record.suspect) state.counts[key].fake += 1;
  else state.counts[key].real += 1;
  saveInviteState(state);
  return record;
}

export function markInviteLeft(inviteeId) {
  const state = getInviteState();
  let changed = null;
  for (let i = state.records.length - 1; i >= 0; i -= 1) {
    const record = state.records[i];
    if (record.inviteeId === inviteeId && !record.leftAt) {
      record.leftAt = new Date().toISOString();
      const key = record.inviterId ?? 'unknown';
      state.counts[key] = state.counts[key] ?? { real: 0, fake: 0, leaves: 0 };
      if (record.suspect) state.counts[key].fake = Math.max(0, state.counts[key].fake - 1);
      else state.counts[key].real = Math.max(0, state.counts[key].real - 1);
      state.counts[key].leaves += 1;
      changed = record;
      break;
    }
  }
  if (changed) saveInviteState(state);
  return changed;
}

export function getInviteCounts(userId) {
  return getInviteState().counts[userId] ?? { real: 0, fake: 0, leaves: 0 };
}

export function listInviteRecords(userId, limit = 10) {
  return getInviteState().records
    .filter((r) => r.inviterId === userId)
    .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
    .slice(0, limit);
}

export function listInviteCounts() {
  return Object.entries(getInviteState().counts).map(([userId, data]) => ({ userId, ...data }));
}

/* ------------------------------ Suggestions ------------------------------ */

export function nextSuggestionId() {
  const store = readStore('suggestions', EMPTY.suggestions);
  const id = store.nextId ?? 1;
  store.nextId = id + 1;
  writeStore('suggestions', store);
  return id;
}

export function saveSuggestion(suggestion) {
  const store = readStore('suggestions', EMPTY.suggestions);
  store.items[String(suggestion.id)] = suggestion;
  writeStore('suggestions', store);
  return suggestion;
}

export function getSuggestion(id) {
  return readStore('suggestions', EMPTY.suggestions).items[String(id)] ?? null;
}

export function updateSuggestion(id, patch) {
  const store = readStore('suggestions', EMPTY.suggestions);
  const suggestion = store.items[String(id)];
  if (!suggestion) return null;
  Object.assign(suggestion, patch);
  store.items[String(id)] = suggestion;
  writeStore('suggestions', store);
  return suggestion;
}

export function listSuggestions(status = null) {
  const items = Object.values(readStore('suggestions', EMPTY.suggestions).items);
  return status ? items.filter((s) => s.status === status) : items;
}

/* --------------------------------- Polls --------------------------------- */

export function nextPollId() {
  const store = readStore('polls', EMPTY.polls);
  const id = store.nextId ?? 1;
  store.nextId = id + 1;
  writeStore('polls', store);
  return id;
}

export function savePoll(poll) {
  const store = readStore('polls', EMPTY.polls);
  store.items[String(poll.id)] = poll;
  writeStore('polls', store);
  return poll;
}

export function getPoll(id) {
  return readStore('polls', EMPTY.polls).items[String(id)] ?? null;
}

export function updatePoll(id, patch) {
  const store = readStore('polls', EMPTY.polls);
  const poll = store.items[String(id)];
  if (!poll) return null;
  Object.assign(poll, patch);
  store.items[String(id)] = poll;
  writeStore('polls', store);
  return poll;
}

export function listPolls(activeOnly = false) {
  const items = Object.values(readStore('polls', EMPTY.polls).items);
  return activeOnly ? items.filter((p) => !p.ended) : items;
}

/* -------------------------------- Schedule ------------------------------- */

export function nextScheduleId() {
  const store = readStore('schedule', EMPTY.schedule);
  const id = store.nextId ?? 1;
  store.nextId = id + 1;
  writeStore('schedule', store);
  return id;
}

export function saveScheduleItem(item) {
  const store = readStore('schedule', EMPTY.schedule);
  store.items[String(item.id)] = item;
  writeStore('schedule', store);
  return item;
}

export function getScheduleItem(id) {
  return readStore('schedule', EMPTY.schedule).items[String(id)] ?? null;
}

export function updateScheduleItem(id, patch) {
  const store = readStore('schedule', EMPTY.schedule);
  const item = store.items[String(id)];
  if (!item) return null;
  Object.assign(item, patch);
  store.items[String(id)] = item;
  writeStore('schedule', store);
  return item;
}

export function deleteScheduleItem(id) {
  const store = readStore('schedule', EMPTY.schedule);
  const item = store.items[String(id)] ?? null;
  if (!item) return null;
  delete store.items[String(id)];
  writeStore('schedule', store);
  return item;
}

export function listScheduleItems() {
  return Object.values(readStore('schedule', EMPTY.schedule).items);
}

/* ---------------------------------- Notes -------------------------------- */

export function addNote(userId, note) {
  const store = readStore('notes', EMPTY.notes);
  const list = store.items[userId] ?? [];
  list.push({ ...note, createdAt: new Date().toISOString() });
  store.items[userId] = list;
  writeStore('notes', store);
  return list.length;
}

export function listNotes(userId) {
  return readStore('notes', EMPTY.notes).items[userId] ?? [];
}

export function removeNote(userId, index) {
  const store = readStore('notes', EMPTY.notes);
  const list = store.items[userId] ?? [];
  const position = Number(index) - 1;
  if (!Number.isInteger(position) || position < 0 || position >= list.length) {
    throw new Error('index de note invalide');
  }
  const [removed] = list.splice(position, 1);
  if (list.length === 0) delete store.items[userId];
  else store.items[userId] = list;
  writeStore('notes', store);
  return removed;
}

/* -------------------------------- Reminders ------------------------------ */

export function nextReminderId() {
  const store = readStore('reminders', EMPTY.reminders);
  const id = store.nextId ?? 1;
  store.nextId = id + 1;
  writeStore('reminders', store);
  return id;
}

export function saveReminder(reminder) {
  const store = readStore('reminders', EMPTY.reminders);
  store.items[String(reminder.id)] = reminder;
  writeStore('reminders', store);
  return reminder;
}

export function getReminder(id) {
  return readStore('reminders', EMPTY.reminders).items[String(id)] ?? null;
}

export function deleteReminder(id) {
  const store = readStore('reminders', EMPTY.reminders);
  const reminder = store.items[String(id)] ?? null;
  if (!reminder) return null;
  delete store.items[String(id)];
  writeStore('reminders', store);
  return reminder;
}

export function listReminders(userId = null) {
  const items = Object.values(readStore('reminders', EMPTY.reminders).items);
  return userId ? items.filter((r) => r.userId === userId) : items;
}

/* -------------------------------- Starboard ------------------------------ */

export function getStarboardEntry(messageId) {
  return readStore('starboard', EMPTY.starboard).items[messageId] ?? null;
}

export function saveStarboardEntry(messageId, data) {
  const store = readStore('starboard', EMPTY.starboard);
  store.items[messageId] = data;
  writeStore('starboard', store);
  return data;
}

export function deleteStarboardEntry(messageId) {
  const store = readStore('starboard', EMPTY.starboard);
  const entry = store.items[messageId] ?? null;
  if (entry) {
    delete store.items[messageId];
    writeStore('starboard', store);
  }
  return entry;
}

/* --------------------------------- Automod ------------------------------- */

export function getWordlist() {
  return readStore('automod', EMPTY.automod).wordlist ?? [];
}

export function addAutomodWord(word) {
  const clean = String(word).trim();
  if (!clean) throw new Error('mot invalide');
  const store = readStore('automod', EMPTY.automod);
  store.wordlist = store.wordlist ?? [];
  if (store.wordlist.some((w) => w.toLowerCase() === clean.toLowerCase())) throw new Error('mot déjà présent');
  store.wordlist.push(clean);
  writeStore('automod', store);
  return store.wordlist;
}

export function removeAutomodWord(word) {
  const clean = String(word).trim().toLowerCase();
  const store = readStore('automod', EMPTY.automod);
  const before = (store.wordlist ?? []).length;
  store.wordlist = (store.wordlist ?? []).filter((w) => w.toLowerCase() !== clean);
  if (store.wordlist.length === before) throw new Error('mot introuvable');
  writeStore('automod', store);
  return store.wordlist;
}

/* ----------------------------- Custom commands --------------------------- */

export function listCustomCommands() {
  return Object.values(readStore('customcmds', EMPTY.customcmds).items);
}

export function getCustomCommand(name) {
  return readStore('customcmds', EMPTY.customcmds).items[keyOf(name)] ?? null;
}

export function addCustomCommand(name, response, createdBy) {
  const slug = keyOf(name).replace(/\s+/g, '-');
  if (!slug) throw new Error('nom invalide');
  const store = readStore('customcmds', EMPTY.customcmds);
  if (store.items[slug]) throw new Error('commande déjà existante');
  store.items[slug] = { name: slug, response, createdBy, createdAt: new Date().toISOString() };
  writeStore('customcmds', store);
  return store.items[slug];
}

export function removeCustomCommand(name) {
  const slug = keyOf(name).replace(/\s+/g, '-');
  const store = readStore('customcmds', EMPTY.customcmds);
  if (!store.items[slug]) throw new Error('commande introuvable');
  delete store.items[slug];
  writeStore('customcmds', store);
  return true;
}

/* -------------------------------- Security ------------------------------- */

export function getSecurityState() {
  const state = readStore('security', EMPTY.security);
  return { joinTimes: Array.isArray(state.joinTimes) ? state.joinTimes : [] };
}

export function saveSecurityState(patch) {
  const state = getSecurityState();
  const next = { ...state, ...patch };
  writeStore('security', next);
  return next;
}

/* ---------------------------------- Bumps -------------------------------- */

export function getBumps() {
  const state = readStore('bumps', EMPTY.bumps);
  return {
    counts: state.counts ?? {},
    lastBumpAt: state.lastBumpAt ?? null,
    nextReminderAt: state.nextReminderAt ?? null,
  };
}

export function recordBump(userId) {
  const state = getBumps();
  state.counts[userId] = (state.counts[userId] ?? 0) + 1;
  state.lastBumpAt = new Date().toISOString();
  writeStore('bumps', state);
  return state.counts[userId];
}

export function setBumpReminder(iso) {
  const state = getBumps();
  state.nextReminderAt = iso;
  writeStore('bumps', state);
  return state;
}

/* ------------------------------ Temp voice ------------------------------- */

export function listTempVoice() {
  return readStore('tempvoice', EMPTY.tempvoice).items ?? {};
}

export function addTempVoice(channelId, ownerId) {
  const store = readStore('tempvoice', EMPTY.tempvoice);
  store.items[channelId] = { ownerId, createdAt: new Date().toISOString() };
  writeStore('tempvoice', store);
  return store.items[channelId];
}

export function removeTempVoice(channelId) {
  const store = readStore('tempvoice', EMPTY.tempvoice);
  const entry = store.items[channelId] ?? null;
  if (entry) {
    delete store.items[channelId];
    writeStore('tempvoice', store);
  }
  return entry;
}

/* --------------------------------- Reports ------------------------------- */

export function nextReportId() {
  const store = readStore('reports', EMPTY.reports);
  const id = store.nextId ?? 1;
  store.nextId = id + 1;
  writeStore('reports', store);
  return id;
}

export function saveReport(report) {
  const store = readStore('reports', EMPTY.reports);
  store.items[String(report.id)] = report;
  writeStore('reports', store);
  return report;
}

export function getReport(id) {
  return readStore('reports', EMPTY.reports).items[String(id)] ?? null;
}

export function updateReport(id, patch) {
  const store = readStore('reports', EMPTY.reports);
  const report = store.items[String(id)];
  if (!report) return null;
  Object.assign(report, patch);
  store.items[String(id)] = report;
  writeStore('reports', store);
  return report;
}

export function listReports(status = null) {
  const items = Object.values(readStore('reports', EMPTY.reports).items);
  return status ? items.filter((report) => report.status === status) : items;
}

export function listReportsAgainst(userId) {
  return listReports().filter((report) => report.reportedId === userId);
}

/* ------------------------------ Temp roles ------------------------------- */

export function listTempRoles(userId = null) {
  const items = readStore('temproles', EMPTY.temproles).items ?? [];
  return userId ? items.filter((entry) => entry.userId === userId) : items;
}

export function addTempRole(entry) {
  const store = readStore('temproles', EMPTY.temproles);
  store.items = Array.isArray(store.items) ? store.items : [];
  store.items.push(entry);
  writeStore('temproles', store);
  return entry;
}

export function removeTempRole(userId, roleId) {
  const store = readStore('temproles', EMPTY.temproles);
  store.items = Array.isArray(store.items) ? store.items : [];
  const index = store.items.findIndex((entry) => entry.userId === userId && entry.roleId === roleId);
  if (index === -1) throw new Error('rôle temporaire introuvable');
  const [removed] = store.items.splice(index, 1);
  writeStore('temproles', store);
  return removed;
}

export function removeTempRoleById(id) {
  const store = readStore('temproles', EMPTY.temproles);
  store.items = Array.isArray(store.items) ? store.items : [];
  const index = store.items.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  const [removed] = store.items.splice(index, 1);
  writeStore('temproles', store);
  return removed;
}

/* -------------------------------- Payments ------------------------------- */

export function addPayment(entry) {
  const store = readStore('payments', EMPTY.payments);
  store.items = Array.isArray(store.items) ? store.items : [];
  const record = { id: store.items.length + 1, ...entry, createdAt: new Date().toISOString() };
  store.items.push(record);
  writeStore('payments', store);
  return record;
}

export function listPayments(userId = null) {
  const items = readStore('payments', EMPTY.payments).items ?? [];
  return userId ? items.filter((entry) => entry.userId === userId) : items;
}

/* ------------------------------- Pin panels ------------------------------ */

export function getPinPanel(channelId) {
  return readStore('pinpanels', EMPTY.pinpanels).items[channelId] ?? null;
}

export function savePinPanel(channelId, data) {
  const store = readStore('pinpanels', EMPTY.pinpanels);
  store.items[channelId] = { ...data, channelId, updatedAt: new Date().toISOString() };
  writeStore('pinpanels', store);
  return store.items[channelId];
}

export function deletePinPanel(channelId) {
  const store = readStore('pinpanels', EMPTY.pinpanels);
  const entry = store.items[channelId] ?? null;
  if (entry) {
    delete store.items[channelId];
    writeStore('pinpanels', store);
  }
  return entry;
}

export function listPinPanels() {
  return Object.values(readStore('pinpanels', EMPTY.pinpanels).items);
}

/* -------------------------------- Userstats ------------------------------ */

export function getUserStats(userId) {
  const store = readStore('userstats', EMPTY.userstats);
  return {
    messages: Number(store.messages?.[userId]) || 0,
    voiceMs: Number(store.voice?.[userId]) || 0,
  };
}

export function incrementUserMessages(userId) {
  const store = readStore('userstats', EMPTY.userstats);
  store.messages = store.messages ?? {};
  store.messages[userId] = (Number(store.messages[userId]) || 0) + 1;
  writeStore('userstats', store);
  return store.messages[userId];
}

export function addUserVoice(userId, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return getUserStats(userId).voiceMs;
  const store = readStore('userstats', EMPTY.userstats);
  store.voice = store.voice ?? {};
  store.voice[userId] = (Number(store.voice[userId]) || 0) + Math.round(ms);
  writeStore('userstats', store);
  return store.voice[userId];
}

export function listUserMessages() {
  const store = readStore('userstats', EMPTY.userstats);
  return Object.entries(store.messages ?? {}).map(([userId, count]) => ({ userId, count: Number(count) || 0 }));
}

export function listUserVoice() {
  const store = readStore('userstats', EMPTY.userstats);
  return Object.entries(store.voice ?? {}).map(([userId, ms]) => ({ userId, ms: Number(ms) || 0 }));
}

/* ------------------------------ Announcements ---------------------------- */

export function saveAnnouncement(id, data) {
  const store = readStore('announcements', EMPTY.announcements);
  store.items[String(id)] = { ...data, createdAt: new Date().toISOString() };
  writeStore('announcements', store);
  return store.items[String(id)];
}

export function getAnnouncement(id) {
  return readStore('announcements', EMPTY.announcements).items[String(id)] ?? null;
}

/* --------------------------------- Escrow -------------------------------- */

export function nextEscrowId() {
  const store = readStore('escrow', EMPTY.escrow);
  const id = store.nextId ?? 1;
  store.nextId = id + 1;
  writeStore('escrow', store);
  return id;
}

export function saveEscrow(entry) {
  const store = readStore('escrow', EMPTY.escrow);
  store.items[String(entry.id)] = entry;
  writeStore('escrow', store);
  return entry;
}

export function getEscrow(id) {
  return readStore('escrow', EMPTY.escrow).items[String(id)] ?? null;
}

export function updateEscrow(id, patch) {
  const store = readStore('escrow', EMPTY.escrow);
  const entry = store.items[String(id)];
  if (!entry) return null;
  Object.assign(entry, patch);
  store.items[String(id)] = entry;
  writeStore('escrow', store);
  return entry;
}

export function listEscrows(status = null) {
  const items = Object.values(readStore('escrow', EMPTY.escrow).items);
  return status ? items.filter((entry) => entry.status === status) : items;
}

/* --------------------------------- Reset --------------------------------- */

export function resetStore(name) {
  switch (name) {
    case 'leaks':
      writeStore('stats', { ...EMPTY.stats, createdAt: new Date().toISOString() });
      return 'leaks';
    case 'tools':
      writeStore('tools', { items: {} });
      writeStore('vouchs', { items: {} });
      return 'tools + vouchs';
    case 'vouchs':
      writeStore('vouchs', { items: {} });
      return 'vouchs';
    case 'tickets':
      writeStore('tickets', { nextId: 1, items: {} });
      return 'tickets';
    default:
      throw new Error(`cible inconnue: ${name}`);
  }
}

export { EMPTY, SEED_CATEGORIES };
