import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getReport, listReports, updateReport } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

function reportLine(report) {
  return `**#${report.id}** — <@${report.reportedId}> — signalé par <@${report.reporterId}> — ${report.status}${report.channelId ? ` — <#${report.channelId}>` : ''}`;
}

export default {
  category: 'Sécurité',
  description: 'Gère les signalements de scam',
  data: new SlashCommandBuilder()
    .setName('reports')
    .setDescription('Gère les signalements de scam')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Liste les signalements ouverts')
        .addStringOption((opt) =>
          opt
            .setName('statut')
            .setDescription('Filtrer par statut')
            .addChoices(
              { name: 'Ouvert', value: 'open' },
              { name: 'Résolu', value: 'resolved' },
              { name: 'Tous', value: 'all' },
            )
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('resolve')
        .setDescription('Résout un signalement')
        .addIntegerOption((opt) => opt.setName('id').setDescription('ID du signalement').setRequired(true))
        .addStringOption((opt) => opt.setName('verdict').setDescription('Verdict').setMaxLength(400).setRequired(true)),
    ),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;
      const sub = interaction.options.getSubcommand();

      if (sub === 'list') {
        const filter = interaction.options.getString('statut') ?? 'open';
        const reports = filter === 'all'
          ? listReports()
          : listReports(filter);
        const description = reports.length
          ? reports.slice(-20).reverse().map(reportLine).join('\n')
          : 'Aucun signalement.';

        const row = reports.some((report) => report.status === 'open')
          ? new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('reports_refresh')
              .setLabel('Actualiser')
              .setStyle(ButtonStyle.Secondary),
          )
          : null;

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Signalements — ${reports.length}`, description: description.slice(0, 4000) })],
          components: row ? [row] : [],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'resolve') {
        const id = interaction.options.getInteger('id', true);
        const report = getReport(id);
        if (!report) return replyError(interaction, 'Signalement introuvable.');
        if (report.status === 'resolved') return replyError(interaction, 'Signalement déjà résolu.');

        const verdict = interaction.options.getString('verdict', true);
        updateReport(id, {
          status: 'resolved',
          verdict,
          resolvedBy: interaction.user.id,
          resolvedAt: new Date().toISOString(),
        });

        await log(interaction.client, 'reports', 'resolve', {
          guild: interaction.guild,
          fields: [
            { name: 'ID', value: `#${id}`, inline: true },
            { name: 'Signalé', value: `<@${report.reportedId}>`, inline: true },
            { name: 'Verdict', value: verdict.slice(0, 600), inline: false },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Signalement #${id} résolu`, description: `Verdict : **${verdict}**.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Gestion des signalements impossible.', '/reports');
    }
  },
};
