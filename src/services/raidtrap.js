import { getConfig } from '../config.js';
import { log } from '../logger.js';

// Piège à raid : surveillance d'un salon TEXTE. Tout message d'un membre non
// whitelisté est supprimé, puis le membre est kick. Aucun salon n'est supprimé
// et aucun autre message n'est purgé.
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

  let kickStatus = 'ok';
  try {
    if (!member) throw new Error('membre introuvable');
    if (!member.kickable) throw new Error('membre non kickable');
    await member.kick(String(config.raidTrapBanReason ?? 'raid trap').slice(0, 512));
  } catch (err) {
    kickStatus = `échec: ${err.message}`;
  }

  await log(client, 'security', 'raidTrapTrigger', {
    guild: message.guild,
    description: 'Un membre a écrit dans le salon piège. Message supprimé et membre kické.',
    fields: [
      { name: 'Utilisateur', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
      { name: 'ID', value: message.author.id, inline: true },
      { name: 'Nom du compte', value: message.author.username, inline: true },
      { name: 'Kick', value: kickStatus, inline: true },
      { name: 'Message supprimé', value: 'oui', inline: true },
      { name: 'Contenu', value: (message.content || '[embed/pièce jointe]').slice(0, 1000), inline: false },
      { name: 'Horodatage', value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`, inline: false },
    ],
  });

  return true;
}
