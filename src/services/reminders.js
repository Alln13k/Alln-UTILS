import { deleteReminder, listReminders } from '../db.js';
import { buildEmbed } from '../embeds.js';

const MAX_TIMEOUT = 2_147_483_647;
const timers = new Map();

function schedule(client, reminder) {
  clearTimer(reminder.id);
  const delay = new Date(reminder.dueAt).getTime() - Date.now();
  if (delay <= 0) {
    fire(client, reminder.id).catch(() => null);
    return;
  }

  const wait = Math.min(delay, MAX_TIMEOUT);
  const timer = setTimeout(() => {
    if (delay > MAX_TIMEOUT) {
      const current = listReminders().find((item) => String(item.id) === String(reminder.id));
      if (current) schedule(client, current);
      return;
    }
    fire(client, reminder.id).catch((err) => console.error(`[alln-utils] reminder: ${err.message}`));
  }, wait);

  timers.set(String(reminder.id), timer);
}

function clearTimer(id) {
  const timer = timers.get(String(id));
  if (timer) clearTimeout(timer);
  timers.delete(String(id));
}

async function fire(client, id) {
  const reminder = listReminders().find((item) => String(item.id) === String(id));
  if (!reminder) return;
  clearTimer(id);

  const user = await client.users.fetch(reminder.userId).catch(() => null);
  if (user) {
    await user.send({
      embeds: [buildEmbed({
        dark: true,
        title: '⏰ Rappel',
        description: reminder.text,
        fields: [
          { name: 'Créé le', value: `<t:${Math.floor(new Date(reminder.createdAt).getTime() / 1000)}:F>`, inline: true },
          { name: 'ID', value: `#${reminder.id}`, inline: true },
        ],
      })],
    }).catch(() => null);
  }

  deleteReminder(id);
}

export function addReminder(client, reminder) {
  schedule(client, reminder);
  return reminder;
}

export function removeReminder(id) {
  clearTimer(id);
  return deleteReminder(id);
}

export function startReminderService(client) {
  stopReminderService();
  for (const reminder of listReminders()) schedule(client, reminder);
}

export function stopReminderService() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
