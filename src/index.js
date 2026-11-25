import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  PermissionFlagsBits,
} from 'discord.js';
import { getConfig } from './config.js';
import {
  getCustomCommand,
  getTicketByChannel,
  incrementTicketMessages,
  initDb,
  isBlacklisted,
  listTickets,
  removeExpiredPremiums,
  updateTicket,
} from './db.js';
import { buildEmbed } from './embeds.js';
import { log } from './logger.js';
import { isTicketStaff } from './permissions.js';
import { loadCommands } from './handlers/commands.js';
import { handleButton, handleSelect } from './handlers/buttons.js';
import { handleModal } from './handlers/modals.js';
import { startMemberCountService } from './membercount.js';
import { startGiveawayService } from './services/giveaways.js';
import { startReminderService } from './services/reminders.js';
import { startScheduleService } from './services/schedule.js';
import { startStatsService } from './services/statsChannels.js';
import { startBumpService, handleBumpMessage } from './services/bumps.js';
import { cacheGuildInvites, handleInviteJoin, handleInviteLeave, startInviteService } from './services/invites.js';
import { handleAutomod } from './services/automod.js';
import { handleNewAccountLink, handleSecurityJoin, pruneJoinTimes } from './services/security.js';
import { handleReactionRole } from './services/reactionRoles.js';
import { handleStarboardAdd, handleStarboardRemove } from './services/starboard.js';
import { handleVoiceStateUpdate } from './services/tempVoice.js';
import { handleMessageXp } from './services/levels.js';
import { handleAntiPhishing } from './services/antiPhishing.js';
import { applyUnverifiedRole } from './services/rulesGate.js';
import { startTempRoleService, stopTempRoleService } from './services/temproles.js';
import {
  handleStatsMessage,
  handleStatsVoice,
  startUserStatsService,
  stopUserStatsService,
} from './services/userstats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('[alln-utils] DISCORD_TOKEN manquant. .env requis.');
  process.exit(1);
}

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
initDb();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.GuildMember, Partials.User, Partials.Message, Partials.Reaction, Partials.Channel],
});

client.commands = new Collection();

async function purgeUserMessages(guild, userId, exceptChannelId) {
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

async function handleRaidTrap(message) {
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

async function handleClaimEnforcement(message) {
  if (!message.guild || message.author.bot) return;
  const ticket = getTicketByChannel(message.channelId);
  if (!ticket || ticket.status !== 'claimed' || !ticket.claimedBy) return;
  if (message.author.id === ticket.claimedBy || message.author.id === ticket.userId) return;

  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return;
  if (!isTicketStaff(member)) return;

  await message.delete().catch(() => null);
  const notice = await message.channel.send({
    embeds: [buildEmbed({
      dark: true,
      title: 'Ticket déjà claim',
      description: `Ce ticket est pris en charge par <@${ticket.claimedBy}>. Message de <@${message.author.id}> supprimé.`,
    })],
  }).catch(() => null);

  if (notice) setTimeout(() => notice.delete().catch(() => null), 5000);
}

async function expirePremium() {
  const expired = removeExpiredPremiums();
  if (expired.length === 0) return;

  const config = getConfig();
  for (const entry of expired) {
    for (const guild of client.guilds.cache.values()) {
      const member = await guild.members.fetch(entry.userId).catch(() => null);
      if (member && config.premiumRoleId) {
        await member.roles.remove(config.premiumRoleId, 'Premium expiré').catch(() => null);
      }

      await log(client, 'premium', 'expire', {
        guild,
        fields: [
          { name: 'Utilisateur', value: `<@${entry.userId}>`, inline: true },
          { name: 'Expiré le', value: entry.expiresAt, inline: true },
        ],
      });
    }
  }
}

async function reconcileOrphanTickets() {
  for (const guild of client.guilds.cache.values()) {
    const open = listTickets().filter((t) => t.status !== 'closed');
    for (const ticket of open) {
      const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
      if (!channel) {
        updateTicket(ticket.channelId, {
          status: 'closed',
          closedAt: new Date().toISOString(),
          closedBy: client.user.id,
          closeReason: 'ticket orphelin (salon supprimé)',
        });
      }
    }
  }
}

function replaceVariables(template, message) {
  return String(template)
    .replaceAll('{user}', message.author.username)
    .replaceAll('{mention}', `<@${message.author.id}>`)
    .replaceAll('{server}', message.guild.name)
    .replaceAll('{membercount}', String(message.guild.memberCount));
}

async function handleCustomCommand(message) {
  const config = getConfig();
  const prefix = config.customCommandPrefix || '!';
  if (!message.content.startsWith(prefix)) return false;

  const body = message.content.slice(prefix.length).trim();
  if (!body) return false;
  const name = body.split(/\s+/)[0];
  const command = getCustomCommand(name);
  if (!command) return false;

  await message.reply({
    embeds: [buildEmbed({
      dark: true,
      title: `${prefix}${command.name}`,
      description: replaceVariables(command.response, message),
    })],
  }).catch(() => null);

  return true;
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[alln-utils] connecté: ${readyClient.user.tag} (${readyClient.guilds.cache.size} serveur(s))`);

  await reconcileOrphanTickets();
  await expirePremium();
  pruneJoinTimes(300);

  startInviteService(readyClient);
  startGiveawayService(readyClient);
  startReminderService(readyClient);
  startScheduleService(readyClient);
  startStatsService(readyClient);
  startBumpService(readyClient);
  startTempRoleService(readyClient);
  startUserStatsService(readyClient);
  await startMemberCountService(readyClient);

  setInterval(() => {
    expirePremium().catch((err) => console.error(`[alln-utils] expiration premium: ${err.message}`));
  }, 60 * 60 * 1000);
});

client.on(Events.GuildCreate, (guild) => {
  cacheGuildInvites(guild).catch(() => null);
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const config = getConfig();

    if (config.autoroleId) {
      const role = member.guild.roles.cache.get(config.autoroleId)
        ?? (await member.guild.roles.fetch(config.autoroleId).catch(() => null));
      if (role) await member.roles.add(role, 'Autorole').catch(() => null);
    }

    await applyUnverifiedRole(member);

    const invite = await handleInviteJoin(member).catch(() => null);

    if (config.welcomeChannelId) {
      const channel = await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        await channel.send({
          content: `<@${member.id}>`,
          embeds: [buildEmbed({
            dark: true,
            title: 'Bienvenue',
            description: `Bienvenue sur **${member.guild.name}**, <@${member.id}>.`,
            thumbnail: member.user.displayAvatarURL({ size: 256 }),
            fields: [
              { name: 'Membre n°', value: String(member.guild.memberCount), inline: true },
              { name: 'Invité par', value: invite?.inviterId ? `<@${invite.inviterId}>` : 'inconnu', inline: true },
            ],
          })],
        }).catch(() => null);
      }
    }

    await log(client, 'member', 'join', {
      guild: member.guild,
      fields: [
        { name: 'Membre', value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: 'Compte créé', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Invitation', value: invite?.code ? `\`${invite.code}\` par <@${invite.inviterId ?? '0'}>` : 'inconnue', inline: true },
      ],
    });

    await handleSecurityJoin(client, member).catch(() => null);
  } catch (err) {
    console.error(`[alln-utils] guildMemberAdd: ${err.stack ?? err.message}`);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    handleInviteLeave(member);

    await log(client, 'member', 'leave', {
      guild: member.guild,
      fields: [{ name: 'Membre', value: `${member.user.tag} (${member.id})`, inline: true }],
    });
  } catch (err) {
    console.error(`[alln-utils] guildMemberRemove: ${err.stack ?? err.message}`);
  }
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    if (oldMember.nickname !== newMember.nickname) {
      await log(client, 'member', 'nicknameChange', {
        guild: newMember.guild,
        fields: [
          { name: 'Membre', value: `<@${newMember.id}>`, inline: true },
          { name: 'Avant', value: oldMember.nickname ?? 'aucun', inline: true },
          { name: 'Après', value: newMember.nickname ?? 'aucun', inline: true },
        ],
      });
    }

    const added = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
    const removed = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));

    if (added.size > 0) {
      await log(client, 'member', 'roleAdd', {
        guild: newMember.guild,
        fields: [
          { name: 'Membre', value: `<@${newMember.id}>`, inline: true },
          { name: 'Rôles', value: added.map((role) => `<@&${role.id}>`).join(', ').slice(0, 1000), inline: false },
        ],
      });
    }

    if (removed.size > 0) {
      await log(client, 'member', 'roleRemove', {
        guild: newMember.guild,
        fields: [
          { name: 'Membre', value: `<@${newMember.id}>`, inline: true },
          { name: 'Rôles', value: removed.map((role) => `<@&${role.id}>`).join(', ').slice(0, 1000), inline: false },
        ],
      });
    }

    const wasTimedOut = Boolean(oldMember.communicationDisabledUntilTimestamp);
    const isTimedOut = Boolean(newMember.communicationDisabledUntilTimestamp);

    if (!wasTimedOut && isTimedOut) {
      await log(client, 'member', 'timeoutAdd', {
        guild: newMember.guild,
        fields: [
          { name: 'Membre', value: `<@${newMember.id}>`, inline: true },
          { name: 'Fin', value: `<t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>`, inline: true },
        ],
      });
    }

    if (wasTimedOut && !isTimedOut) {
      await log(client, 'member', 'timeoutRemove', {
        guild: newMember.guild,
        fields: [{ name: 'Membre', value: `<@${newMember.id}>`, inline: true }],
      });
    }
  } catch (err) {
    console.error(`[alln-utils] guildMemberUpdate: ${err.stack ?? err.message}`);
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild) return;

    if (await handleBumpMessage(client, message)) return;
    if (message.author.bot) return;

    if (await handleRaidTrap(message)) return;

    const ticket = getTicketByChannel(message.channelId);
    if (ticket) {
      incrementTicketMessages(message.channelId);
      await handleClaimEnforcement(message);
    }

    handleStatsMessage(message);

    if (await handleNewAccountLink(client, message)) return;
    if (await handleAntiPhishing(client, message)) return;
    if (await handleAutomod(client, message)) return;

    if (await handleCustomCommand(message)) return;

    await handleMessageXp(client, message);
  } catch (err) {
    console.error(`[alln-utils] messageCreate: ${err.stack ?? err.message}`);
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  await handleReactionRole(reaction, user, true).catch(() => null);
  await handleStarboardAdd(client, reaction, user).catch(() => null);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  await handleReactionRole(reaction, user, false).catch(() => null);
  await handleStarboardRemove(client, reaction, user).catch(() => null);
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  await handleVoiceStateUpdate(client, oldState, newState).catch((err) => {
    console.error(`[alln-utils] voiceStateUpdate: ${err.message}`);
  });
  try {
    handleStatsVoice(client, oldState, newState);
  } catch (err) {
    console.error(`[alln-utils] userstats voice: ${err.message}`);
  }
});

async function replyEphemeral(interaction, title, description) {
  const payload = { embeds: [buildEmbed({ dark: true, title, description })], flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
  if (interaction.isRepliable?.()) return interaction.reply(payload).catch(() => null);
  return null;
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.user && isBlacklisted(interaction.user.id)) {
      return replyEphemeral(interaction, 'Accès refusé', 'Tu es blacklisté de ce bot.');
    }

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) return await handleButton(interaction);
    if (interaction.isModalSubmit()) return await handleModal(interaction);
    if (interaction.isStringSelectMenu()) return await handleSelect(interaction);
  } catch (err) {
    console.error(`[alln-utils] interaction: ${err.stack ?? err.message}`);
    await log(client, 'errors', 'interaction', {
      guild: interaction.guild,
      description: String(err.message ?? err).slice(0, 1500),
      fields: [
        { name: 'Type', value: interaction.type ? String(interaction.type) : 'inconnu', inline: true },
        { name: 'Utilisateur', value: `<@${interaction.user?.id ?? '0'}>`, inline: true },
      ],
    }).catch(() => null);
    await replyEphemeral(interaction, 'Erreur', 'Une erreur est survenue.');
  }
});

process.on('unhandledRejection', (reason) => console.error(`[alln-utils] unhandledRejection: ${reason?.stack ?? reason}`));
process.on('uncaughtException', (err) => console.error(`[alln-utils] uncaughtException: ${err.stack ?? err.message}`));
process.once('beforeExit', () => {
  stopTempRoleService();
  stopUserStatsService();
});

await loadCommands(client);
await client.login(token);
