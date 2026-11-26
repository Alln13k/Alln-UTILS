import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed, buildError } from '../embeds.js';
import { buildTicketPanelComponents } from '../handlers/buttons.js';
import { log } from '../logger.js';
import { requireAdmin } from '../permissions.js';
import { getConfig } from '../config.js';

export default {
  category: 'Tickets',
  description: 'Affiche le panel de tickets',
  data: new SlashCommandBuilder()
    .setName('ticket_panel')
    .setDescription('Affiche le panel d\'ouverture de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const config = getConfig();
    if (!config.ticketCategoryId) {
      return interaction.reply({ embeds: [buildError('Aucune catégorie de tickets configurée.')], flags: MessageFlags.Ephemeral });
    }

    const components = buildTicketPanelComponents();

    await interaction.channel.send({
      embeds: [buildEmbed({ dark: true, title: 'Support — Ouverture de ticket', description: 'Sélectionne une catégorie pour ouvrir un ticket.' })],
      components,
    });

    await log(interaction.client, 'tickets', 'panel', {
      guild: interaction.guild,
      fields: [
        { name: 'Salon', value: `<#${interaction.channelId}>`, inline: true },
        { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Panel envoyé', description: 'Le panel de tickets a été publié dans ce salon.' })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
