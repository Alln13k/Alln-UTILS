import { AttachmentBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildExport } from '../exportCsv.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireAdmin, replyError } from '../permissions.js';

export default {
  category: 'Administration',
  description: 'Exporte des données en CSV envoyé en DM',
  data: new SlashCommandBuilder()
    .setName('export')
    .setDescription('Exporte des données en CSV envoyé en DM')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Données à exporter')
        .setRequired(true)
        .addChoices(
          { name: 'Tickets', value: 'tickets' },
          { name: 'Warns', value: 'warns' },
          { name: 'Payments', value: 'payments' },
        ),
    ),

  async execute(interaction) {
    try {
      if (!(await requireAdmin(interaction))) return;

      const type = interaction.options.getString('type', true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const { filename, content } = buildExport(type);
      const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), { name: filename });

      await interaction.user.send({
        embeds: [buildEmbed({
          dark: true,
          title: `Export — ${type}`,
          description: `Export \`${type}\` généré pour **${interaction.guild.name}**.`,
          fields: [{ name: 'Fichier', value: filename, inline: false }],
        })],
        files: [file],
      });

      await log(interaction.client, 'export', 'generated', {
        guild: interaction.guild,
        fields: [
          { name: 'Type', value: type, inline: true },
          { name: 'Fichier', value: filename, inline: true },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });

      return interaction.editReply({
        embeds: [buildEmbed({ dark: true, title: 'Export envoyé', description: `Le CSV \`${filename}\` a été envoyé en DM.` })],
      });
    } catch (err) {
      return fail(interaction, err, 'Export impossible. Vérifie que tes DM sont ouverts.', '/export');
    }
  },
};
