import { Events, PermissionFlagsBits } from 'discord.js';
import { getConfig } from '../config.js';
import { log } from '../logger.js';

let trapHandler = null;

async function onVoiceStateUpdate(client, oldState, newState) {
  try {
    const config = getConfig();
    if (!config.raidTrapEnabled || !config.raidTrapChannelId) return;
    if (!newState.channelId || newState.channelId !== config.raidTrapChannelId) return;
    if (oldState.channelId === newState.channelId) return;
    if (newState.member?.id === client.user.id || newState.member?.user?.bot) return;

    const member = newState.member ?? (await newState.guild.members.fetch(newState.userId).catch(() => null));
    if (!member) return;
    if (member.permissions?.has(PermissionFlagsBits.Administrator)) return;

    const whitelist = config.raidTrapWhitelist ?? [];
    if (whitelist.some((roleId) => member.roles.cache.has(roleId))) return;
    if (!member.kickable) {
      await log(client, 'security', 'raidTrapTrigger', {
        guild: newState.guild,
        title: 'Piège à raid — kick impossible',
        fields: [
          { name: 'Membre', value: `<@${member.id}>`, inline: true },
          { name: 'Salon', value: `<#${newState.channelId}>`, inline: true },
          { name: 'Raison', value: 'Permissions insuffisantes pour kick', inline: false },
        ],
      }).catch(() => null);
      return;
    }

    const reason = String(config.raidTrapBanReason ?? 'raid trap').slice(0, 512);
    await member.kick(reason);

    await log(client, 'security', 'raidTrapTrigger', {
      guild: newState.guild,
      title: 'Piège à raid — kick',
      fields: [
        { name: 'Membre', value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: 'Salon piège', value: `<#${newState.channelId}>`, inline: true },
        { name: 'Raison', value: reason, inline: false },
      ],
    });
  } catch (err) {
    console.error(`[alln-utils] raidtrap: ${err.stack ?? err.message}`);
  }
}

export function startRaidTrapService(client) {
  stopRaidTrapService(client);
  trapHandler = (oldState, newState) => onVoiceStateUpdate(client, oldState, newState);
  client.on(Events.VoiceStateUpdate, trapHandler);
  return true;
}

export function stopRaidTrapService(client) {
  if (client && trapHandler) client.off(Events.VoiceStateUpdate, trapHandler);
  trapHandler = null;
}
