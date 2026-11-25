import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  nextReportId,
  saveReport,
} from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, replyError } from '../permissions.js';
import { createPrivateTicket } from '../ticketFactory.js';

export default {
  category: 'Sécurité',
  description: 'Signale un utilisateur au staff',
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Signale un utilisateur au staff')
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('user').setDescription('Utilisateur signalé').setRequired(true))
    .addStringOption((opt) => opt.setName('raison').setDescription('Raison du signalement').setMaxLength(600).setRequired(true))
    .addStringOption((opt) => opt.setName('preuve').setDescription('Preuve (lien ou description)').setMaxLength(1000).setRequired(false)),

  async execute(interaction) {
    try {
      const target = interaction.options.getUser('user', true);
      if (target.id === interaction.user.id) return replyError(interaction, 'Tu ne peux pas te signaler toi-même.');
      if (target.bot) return replyError(interaction, 'Impossible de signaler un bot.');

      const reason = interaction.options.getString('raison', true).trim();
      const proof = interaction.options.getString('preuve')?.trim() ?? null;

      const id = nextReportId();
      const { ticket, channel } = await createPrivateTicket({
        interaction,
        guild: interaction.guild,
        category: 'scam-report',
        subject: `Signalement #${id}`,
        description: `Utilisateur signalé : <@${target.id}>\nRaison : ${reason}`,
        userId: interaction.user.id,
        username: interaction.user.tag,
        accessUserIds: [],
      });

      const report = {
        id,
        status: 'open',
        reporterId: interaction.user.id,
        reportedId: target.id,
        reason,
        proof,
        channelId: channel.id,
        ticketId: ticket.id,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        resolvedBy: null,
        verdict: null,
      };
      saveReport(report);

      await channel.send({
        embeds: [buildEmbed({
          dark: true,
          title: `Signalement #${id}`,
          description: `Signaleur : <@${interaction.user.id}>\nSignalé : <@${target.id}>`,
          fields: [
            { name: 'Raison', value: reason.slice(0, 1000), inline: false },
            { name: 'Preuve', value: proof ? proof.slice(0, 1000) : 'aucune', inline: false },
            { name: 'Lien', value: `/scamcheck ${target.id}`, inline: true },
          ],
        })],
      });

      await log(interaction.client, 'reports', 'open', {
        guild: interaction.guild,
        fields: [
          { name: 'ID', value: `#${id}`, inline: true },
          { name: 'Signalé', value: `<@${target.id}> (${target.tag})`, inline: true },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Raison', value: reason.slice(0, 600), inline: false },
          { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: 'Signalement envoyé',
          description: `Ton signalement **#${id}** a été transmis au staff dans <#${channel.id}>.`,
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Signalement impossible.', '/report');
    }
  },
};
