import { findReactionRoles } from '../db.js';

function matches(entry, emoji) {
  if (!entry?.emoji || !emoji) return false;
  return entry.emoji === emoji.name
    || entry.emoji === emoji.toString()
    || entry.emoji === emoji.id
    || (emoji.id && String(entry.emoji).includes(emoji.id));
}

export async function handleReactionRole(reaction, user, add) {
  try {
    if (!user || user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => null);
    if (reaction.message?.partial) await reaction.message.fetch().catch(() => null);

    const message = reaction.message;
    if (!message?.guild) return;

    const entries = findReactionRoles(message.id).filter((entry) => matches(entry, reaction.emoji));
    if (entries.length === 0) return;

    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    for (const entry of entries) {
      if (add) await member.roles.add(entry.roleId, 'Reaction role').catch(() => null);
      else await member.roles.remove(entry.roleId, 'Reaction role').catch(() => null);
    }
  } catch (err) {
    console.error(`[alln-utils] reaction role: ${err.message}`);
  }
}
