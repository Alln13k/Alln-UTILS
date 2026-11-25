import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Modération',
  description: 'Supprime des messages (1-100)',
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprime des messages (1-100)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addIntegerOption((opt) =>
      opt
        .setName('nombre')
        .setDescription('Nombre de messages à supprimer')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    ),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const amount = interaction.options.getInteger('nombre', true);
      if (!interaction.channel?.isTextBased()) return replyError(interaction, 'Salon invalide.');

      const deleted = await interaction.channel.bulkDelete(amount, true);

      await log(interaction.client, 'moderation', 'clear', {
        guild: interaction.guild,
        title: 'Clear',
        fields: [
          { name: 'Salon', value: `<#${interaction.channelId}>`, inline: true },
          { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Action', value: 'clear', inline: true },
          { name: 'Demandés', value: String(amount), inline: true },
          { name: 'Supprimés', value: String(deleted.size), inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Messages supprimés', description: `${deleted.size} message(s) supprimé(s) dans <#${interaction.channelId}>.` })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Suppression impossible. Les messages de plus de 14 jours ne peuvent pas être supprimés en masse.', '/clear');
    }
  },
};
