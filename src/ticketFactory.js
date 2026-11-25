import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getConfig } from './config.js';
import { nextTicketId, saveTicket, updateTicket } from './db.js';
import { buildTicketEmbed, buildTicketRow } from './ticketUi.js';

function sanitize(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 18) || 'ticket';
}

export async function createPrivateTicket({
  interaction,
  guild,
  category,
  subject,
  description,
  userId,
  username,
  accessUserIds = [],
}) {
  const config = getConfig();
  if (!config.ticketCategoryId) throw new Error('Aucune catégorie de tickets configurée.');

  const parent = await guild.channels.fetch(config.ticketCategoryId).catch(() => null);
  if (!parent || parent.type !== ChannelType.GuildCategory) throw new Error('Catégorie de tickets invalide.');

  const id = nextTicketId();
  const name = `${sanitize(category)}-${sanitize(username ?? 'user')}-${id}`.slice(0, 100);

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  const allowedUsers = new Set([userId, ...accessUserIds.filter(Boolean)]);
  for (const memberId of allowedUsers) {
    overwrites.push({
      id: memberId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  for (const roleId of [config.ticketStaffRoleId, config.staffRoleId]) {
    if (!roleId || overwrites.some((entry) => entry.id === roleId)) continue;
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parent.id,
    topic: `${category} #${id} — ${subject.slice(0, 120)}`,
    permissionOverwrites: overwrites,
  });

  const ticket = {
    id,
    channelId: channel.id,
    guildId: guild.id,
    userId,
    username: username ?? String(userId),
    category,
    subject,
    description,
    status: 'open',
    priority: 'normale',
    claimedBy: null,
    createdAt: new Date().toISOString(),
    closedAt: null,
    closedBy: null,
    closeReason: null,
    messageCount: 0,
    panelMessageId: null,
    addedUsers: [...accessUserIds.filter((memberId) => memberId && memberId !== userId)],
  };
  saveTicket(ticket);

  const panel = await channel.send({
    content: `<@${userId}>${config.ticketStaffRoleId ? ` <@&${config.ticketStaffRoleId}>` : ''}`,
    embeds: [buildTicketEmbed(ticket)],
    components: [buildTicketRow()],
  });

  updateTicket(channel.id, { panelMessageId: panel.id });
  ticket.panelMessageId = panel.id;

  return { ticket, channel, panel };
}
