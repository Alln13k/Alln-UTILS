import { getConfig } from '../config.js';
import { log } from '../logger.js';

// Code d'origine : le piège surveille un salon TEXTE. Tout message d'un membre
// non whitelisté déclenche le bannissement et la purge de ses messages (24 h).
export async function purgeUserMessages(guild, userId, exceptChannelId) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const channel of guild.channels.cache.values()) {
    if (channel.id === exceptChannelId) continue;
    if (!channel.isTextBased() || channel.isThread()) continue;

    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) continue;

    const targets = messages.filter((m) => m.author?.id === userId && m.createdTimestamp > cutoff);
    if (targets.size === 0) continue;

    const deleted = await channel.bulkDelete(targets, true).catch(() => null);
    if (deleted) removed += deleted.size;
  }

  return removed;
}

export async function handleRaidTrap(client, message) {
  const config = getConfig();
  if (!config.raidTrapEnabled || !config.raidTrapChannelId) return false;
  if (message.channelId !== config.raidTrapChannelId) return false;
  if (!message.guild || message.author.bot) return false;

  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  const whitelist = config.raidTrapWhitelist ?? [];
  if (member && whitelist.some((roleId) => member.roles.cache.has(roleId))) {
    return false;
  }

  await message.delete().catch(() => null);

  let banStatus = 'ok';
  try {
    if (member && !member.bannable) throw new Error('membre non bannissable');
    await message.guild.members.ban(message.author.id, { reason: config.raidTrapBanReason });
  } catch (err) {
    banStatus = `échec: ${err.message}`;
  }

  const purged = member ? await purgeUserMessages(message.guild, message.author.id, message.channelId) : 0;

  await log(client, 'security', 'raidTrapTrigger', {
    guild: message.guild,
    description: 'Un membre a écrit dans le salon piège.',
    fields: [
      { name: 'Utilisateur', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
      { name: 'ID', value: message.author.id, inline: true },
      { name: 'Nom du compte', value: message.author.username, inline: true },
      { name: 'Ban', value: banStatus, inline: true },
      { name: 'Messages purgés (24h)', value: String(purged), inline: true },
      { name: 'Contenu', value: (message.content || '[embed/pièce jointe]').slice(0, 1000), inline: false },
      { name: 'Horodatage', value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`, inline: false },
    ],
  });

  return true;
}
