import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { addReactionRole, listReactionRoles, removeReactionRole } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Engagement',
  description: 'Gère les rôles par réaction',
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Gère les rôles par réaction')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Associe un emoji à un rôle sur un message')
        .addStringOption((opt) => opt.setName('message_id').setDescription('ID du message').setRequired(true))
        .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji (unicode ou personnalisé)').setRequired(true))
        .addRoleOption((opt) => opt.setName('role').setDescription('Rôle à attribuer').setRequired(true))
        .addChannelOption((opt) => opt.setName('salon').setDescription('Salon du message').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Retire une association')
        .addStringOption((opt) => opt.setName('message_id').setDescription('ID du message').setRequired(true))
        .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les réaction-rôles')),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const messageId = interaction.options.getString('message_id', true).trim();
        const emoji = interaction.options.getString('emoji', true).trim();
        const role = interaction.options.getRole('role', true);
        const channel = interaction.options.getChannel('salon') ?? interaction.channel;

        if (!channel?.isTextBased()) return replyError(interaction, 'Salon invalide.');

        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) return replyError(interaction, 'Message introuvable dans ce salon.');

        if (listReactionRoles().some((entry) => entry.messageId === messageId && entry.emoji === emoji)) {
          return replyError(interaction, 'Cette association existe déjà.');
        }

        await message.react(emoji).catch(() => null);
        addReactionRole({
          messageId,
          channelId: channel.id,
          emoji,
          roleId: role.id,
          createdBy: interaction.user.id,
          createdAt: new Date().toISOString(),
        });

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Réaction-rôle ajouté',
            description: `${emoji} → <@&${role.id}> sur [ce message](${message.url}).`,
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'remove') {
        const messageId = interaction.options.getString('message_id', true).trim();
        const emoji = interaction.options.getString('emoji', true).trim();
        removeReactionRole(messageId, emoji);

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Réaction-rôle retiré', description: `${emoji} n'est plus associé au message \`${messageId}\`.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'list') {
        const entries = listReactionRoles();
        const description = entries.length
          ? entries.map((entry) => `<#${entry.channelId}> — \`${entry.messageId}\` — ${entry.emoji} → <@&${entry.roleId}>`).join('\n').slice(0, 4000)
          : 'Aucun réaction-rôle configuré.';

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Réaction-rôles — ${entries.length}`, description })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action réaction-rôle impossible.', '/reactionrole');
    }
  },
};
