import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getConfig } from '../config.js';
import { addTempVoice, listTempVoice, removeTempVoice } from '../db.js';
import { log } from '../logger.js';

export async function handleVoiceStateUpdate(client, oldState, newState) {
  const config = getConfig();
  if (!config.voiceHubChannelId) return;

  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  if (newState.channelId === config.voiceHubChannelId) {
    await createTempVoice(client, member, config);
    return;
  }

  const previousChannelId = oldState.channelId;
  if (!previousChannelId) return;

  const temp = listTempVoice()[previousChannelId];
  if (!temp) return;

  const channel = oldState.guild.channels.cache.get(previousChannelId)
    ?? (await oldState.guild.channels.fetch(previousChannelId).catch(() => null));
  if (!channel) {
    removeTempVoice(previousChannelId);
    return;
  }

  if (channel.members.size === 0) {
    await channel.delete('Vocal temporaire vide').catch(() => null);
    removeTempVoice(previousChannelId);
    await log(client, 'voice', 'tempDelete', {
      guild: oldState.guild,
      fields: [
        { name: 'Salon', value: previousChannelId, inline: true },
        { name: 'Propriétaire', value: `<@${temp.ownerId}>`, inline: true },
      ],
    });
  }
}

async function createTempVoice(client, member, config) {
  const guild = member.guild;
  const parent = config.voiceCategoryId
    ? guild.channels.cache.get(config.voiceCategoryId)
      ?? (await guild.channels.fetch(config.voiceCategoryId).catch(() => null))
    : null;

  const channel = await guild.channels.create({
    name: `🔊 ${member.displayName}`.slice(0, 100),
    type: ChannelType.GuildVoice,
    parent: parent?.id ?? null,
    userLimit: Math.max(0, Number(config.voiceMaxMembers) || 0),
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream,
          PermissionFlagsBits.ManageChannels,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.MoveMembers,
        ],
      },
    ],
  }).catch(() => null);

  if (!channel) return;

  addTempVoice(channel.id, member.id);
  await member.voice.setChannel(channel).catch(() => null);

  await log(client, 'voice', 'tempCreate', {
    guild,
    fields: [
      { name: 'Salon', value: `<#${channel.id}>`, inline: true },
      { name: 'Propriétaire', value: `<@${member.id}>`, inline: true },
    ],
  });
}
