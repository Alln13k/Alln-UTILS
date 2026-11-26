import { Events } from 'discord.js';
import { getConfig } from '../config.js';
import { log } from '../logger.js';

let boundClient = null;
let memberAddHandler = null;

export function renderWelcomeMessage(template, member, guild) {
  const variables = {
    '{mention}': `<@${member.id}>`,
    '{user}': member.user?.tag ?? member.displayName ?? member.id,
    '{username}': member.user?.username ?? member.displayName ?? member.id,
    '{guild}': guild?.name ?? 'le serveur',
    '{server}': guild?.name ?? 'le serveur',
    '{count}': String(guild?.memberCount ?? '?'),
  };

  let content = String(template ?? '');
  for (const [placeholder, value] of Object.entries(variables)) {
    content = content.replaceAll(placeholder, value);
  }
  return content.trim().slice(0, 2000);
}

export async function sendWelcomeMessage(client, member, channelOverride = null) {
  if (!member?.guild || member.user?.bot) return false;

  const config = getConfig();
  if (!config.welcomeEnabled || !config.welcomeMessage) return false;

  const guild = member.guild;
  const channelId = channelOverride ?? config.welcomeChannelId;
  if (!channelId) return false;

  const channel = channelOverride
    ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return false;

  const content = renderWelcomeMessage(config.welcomeMessage, member, guild);
  if (!content) return false;

  // Message brut uniquement : aucun embed, aucune mise en forme ajoutée.
  await channel.send({
    content,
    allowedMentions: { users: [member.id], roles: [] },
  });

  await log(client, 'welcome', 'sent', {
    guild,
    description: 'Message de bienvenue envoyé en texte brut.',
    fields: [
      { name: 'Membre', value: `<@${member.id}>`, inline: true },
      { name: 'Salon', value: `<#${channel.id}>`, inline: true },
    ],
  }).catch(() => null);

  return true;
}

export function startWelcomeService(client) {
  stopWelcomeService();
  memberAddHandler = (member) => {
    sendWelcomeMessage(client, member).catch((err) => {
      console.error(`[alln-utils] welcome ${member.id}: ${err.stack ?? err.message}`);
    });
  };
  client.on(Events.GuildMemberAdd, memberAddHandler);
  boundClient = client;
}

export function stopWelcomeService() {
  if (boundClient && memberAddHandler) boundClient.off(Events.GuildMemberAdd, memberAddHandler);
  boundClient = null;
  memberAddHandler = null;
}
