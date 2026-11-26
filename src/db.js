import { readStore, writeStore, updateStore, DATA_DIR } from './store.js';
import fs from 'node:fs';

const FILES = [
  'tickets', 'warns', 'blacklist', 'giveaways', 'notes', 'automod', 'reports',
  'security', 'suggestions',
];

export function initDb() {
  for (const name of FILES) {
    readStore(name, {});
  }
}

export function nextTicketId() {
  const tickets = readStore('tickets', {});
  const ids = Object.values(tickets).map((t) => Number(t.id) || 0);
  return Math.max(0, ...ids) + 1;
}

export function saveTicket(ticket) {
  return updateStore('tickets', {}, (tickets) => {
    tickets[ticket.id] = ticket;
    return tickets;
  });
}

export function getTicketByChannel(channelId) {
  const tickets = readStore('tickets', {});
  return Object.values(tickets).find((t) => t.channelId === channelId) ?? null;
}

export function updateTicket(channelId, patch) {
  const tickets = readStore('tickets', {});
  const ticket = Object.values(tickets).find((t) => t.channelId === channelId);
  if (!ticket) return null;
  tickets[ticket.id] = { ...ticket, ...patch };
  writeStore('tickets', tickets);
  return tickets[ticket.id];
}

export function listTickets(status = null) {
  const tickets = readStore('tickets', {});
  const list = Object.values(tickets);
  return status ? list.filter((t) => t.status === status) : list;
}

export function countOpenTicketsFor(userId) {
  const tickets = readStore('tickets', {});
  return Object.values(tickets).filter((t) => t.userId === userId && t.status !== 'closed').length;
}

export function addWarning(userId, moderatorId, reason) {
  const warns = readStore('warns', {});
  const list = warns[userId] ?? [];
  const id = Math.max(0, ...list.map((w) => Number(w.id) || 0)) + 1;
  const warn = { id, userId, moderatorId, reason, createdAt: new Date().toISOString() };
  list.push(warn);
  warns[userId] = list;
  writeStore('warns', warns);
  return warn;
}

export function getWarns(userId) {
  const warns = readStore('warns', {});
  return warns[userId] ?? [];
}

export function clearWarns(userId) {
  const warns = readStore('warns', {});
  const count = (warns[userId] ?? []).length;
  warns[userId] = [];
  writeStore('warns', warns);
  return count;
}

export function getBlacklist() {
  return readStore('blacklist', {});
}

export function isBlacklisted(userId) {
  const bl = readStore('blacklist', {});
  return Boolean(bl[userId]);
}

export function addBlacklist(userId, reason, moderatorId) {
  return updateStore('blacklist', {}, (bl) => {
    bl[userId] = { userId, reason, moderatorId, createdAt: new Date().toISOString() };
    return bl;
  });
}

export function removeBlacklist(userId) {
  return updateStore('blacklist', {}, (bl) => {
    delete bl[userId];
    return bl;
  });
}

export function saveGiveaway(giveaway) {
  return updateStore('giveaways', {}, (gws) => {
    gws[giveaway.id] = giveaway;
    return gws;
  });
}

export function getGiveaway(id) {
  const gws = readStore('giveaways', {});
  return gws[id] ?? null;
}

export function listGiveaways() {
  return Object.values(readStore('giveaways', {}));
}

export function saveNote(userId, note, moderatorId) {
  return updateStore('notes', {}, (notes) => {
    const id = Math.max(0, ...Object.values(notes).map((n) => Number(n.id) || 0)) + 1;
    notes[id] = { id, userId, note, moderatorId, createdAt: new Date().toISOString() };
    return notes;
  });
}

export function getNotes(userId) {
  const notes = readStore('notes', {});
  return Object.values(notes).filter((n) => n.userId === userId);
}

export function saveReport(report) {
  return updateStore('reports', {}, (reports) => {
    const id = Math.max(0, ...Object.values(reports).map((r) => Number(r.id) || 0)) + 1;
    reports[id] = { ...report, id };
    return reports;
  });
}

export function listReports(status = null) {
  const reports = readStore('reports', {});
  const list = Object.values(reports);
  return status ? list.filter((r) => r.status === status) : list;
}

export function getReport(id) {
  const reports = readStore('reports', {});
  return reports[id] ?? null;
}

export function updateReport(id, patch) {
  const reports = readStore('reports', {});
  if (!reports[id]) return null;
  reports[id] = { ...reports[id], ...patch };
  writeStore('reports', reports);
  return reports[id];
}

export function getAutomod() {
  return readStore('automod', {});
}

export function saveAutomod(data) {
  return writeStore('automod', data);
}

export function getWordlist() {
  const data = getAutomod();
  return Array.isArray(data.wordlist) ? data.wordlist : [];
}

export function countWarns(userId) {
  return getWarns(userId).length;
}

export function getSecurityState() {
  const state = readStore('security', {});
  return { ...state, joinTimes: Array.isArray(state.joinTimes) ? state.joinTimes : [] };
}

export function saveSecurityState(patch) {
  const state = { ...getSecurityState(), ...patch };
  writeStore('security', state);
  return state;
}

export function updateGiveaway(id, patch) {
  const giveaways = readStore('giveaways', {});
  if (!giveaways[id]) return null;
  giveaways[id] = { ...giveaways[id], ...patch };
  writeStore('giveaways', giveaways);
  return giveaways[id];
}

export function deleteGiveaway(id) {
  const giveaways = readStore('giveaways', {});
  const previous = giveaways[id] ?? null;
  delete giveaways[id];
  writeStore('giveaways', giveaways);
  return previous;
}

export function addGiveawayParticipant(id, userId) {
  const giveaways = readStore('giveaways', {});
  const giveaway = giveaways[id];
  if (!giveaway) return { ok: false, reason: 'Giveaway introuvable.' };
  if (giveaway.ended) return { ok: false, reason: 'Giveaway terminé.' };
  const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
  if (participants.includes(userId)) return { ok: false, reason: 'Déjà participant.' };
  giveaways[id] = { ...giveaway, participants: [...participants, userId] };
  writeStore('giveaways', giveaways);
  return { ok: true, giveaway: giveaways[id] };
}

export function nextSuggestionId() {
  const suggestions = readStore('suggestions', {});
  const ids = Object.values(suggestions).map((s) => Number(s.id) || 0);
  return Math.max(0, ...ids) + 1;
}

export function saveSuggestion(suggestion) {
  return updateStore('suggestions', {}, (suggestions) => {
    suggestions[suggestion.id] = suggestion;
    return suggestions;
  });
}

export function getSuggestion(id) {
  const suggestions = readStore('suggestions', {});
  return suggestions[String(id)] ?? null;
}

export function updateSuggestion(id, patch) {
  const suggestions = readStore('suggestions', {});
  const key = String(id);
  if (!suggestions[key]) return null;
  suggestions[key] = { ...suggestions[key], ...patch };
  writeStore('suggestions', suggestions);
  return suggestions[key];
}
