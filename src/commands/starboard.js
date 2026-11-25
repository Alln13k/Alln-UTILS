import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getConfig, setConfigValue } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireAdmin, replyError } from '../permissions.js';

export default {
  category: 'Engagement',
  description: 'Configure le starboard',
  data: new SlashCommandBuilder()
    .setName('starboard')
    .setDescription('Configure le starboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Définit le salon starboard')
        .addChannelOption((opt) => opt.setName('salon').setDescription('Salon starboard').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName('threshold').setDescription('Définit le seuil d\'étoiles').addIntegerOption((opt) => opt.setName('nombre').setDescription('Seuil').setMinValue(1).setMaxValue(100).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName('emoji').setDescription('Définit l\'emoji').addStringOption((opt) => opt.setName('emoji').setDescription('Emoji').setMaxLength(64).setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Affiche la configuration')),

  async execute(interaction) {
    try {
      if (!(await requireAdmin(interaction))) return;
      const sub = interaction.options.getSubcommand();

      if (sub === 'channel') {
        const channel = interaction.options.getChannel('salon', true);
        setConfigValue('starboardChannelId', channel.id);
      } else if (sub === 'threshold') {
        setConfigValue('starboardThreshold', interaction.options.getInteger('nombre', true));
      } else if (sub === 'emoji') {
        setConfigValue('starboardEmoji', interaction.options.getString('emoji', true).trim());
      } else if (sub !== 'status') {
        return replyError(interaction, 'Sous-commande inconnue.');
      }

      const config = getConfig();
      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: 'Starboard',
          fields: [
            { name: 'Salon', value: config.starboardChannelId ? `<#${config.starboardChannelId}>` : 'non défini', inline: true },
            { name: 'Seuil', value: String(config.starboardThreshold), inline: true },
            { name: 'Emoji', value: config.starboardEmoji, inline: true },
          ],
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Configuration starboard impossible.', '/starboard');
    }
  },
};
