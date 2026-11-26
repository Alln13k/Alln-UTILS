import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed, buildError } from '../embeds.js';
import { log } from '../logger.js';
import { requireAdmin } from '../permissions.js';
import { safeReply } from '../respond.js';

export default {
  category: 'Utilitaire',
  description: 'Publie un embed noir',
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Publie un embed personnalisé')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption((opt) => opt.setName('titre').setDescription('Titre de l\'embed').setRequired(true))
    .addStringOption((opt) => opt.setName('description').setDescription('Description de l\'embed').setRequired(true))
    .addChannelOption((opt) => opt.setName('salon').setDescription('Salon de destination').setRequired(false)),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const titre = interaction.options.getString('titre', true);
    const description = interaction.options.getString('description', true);
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    if (!channel?.isTextBased?.()) {
      return safeReply(interaction, {
        embeds: [buildError('Le salon choisi n’accepte pas les messages.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await channel.send({
        embeds: [buildEmbed({ dark: true, title: titre, description })],
      });

      await log(interaction.client, 'config', 'changed', {
        guild: interaction.guild,
        title: 'Embed publié',
        fields: [
          { name: 'Salon', value: `<#${channel.id}>`, inline: true },
          { name: 'Titre', value: titre.slice(0, 1000), inline: false },
          { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Embed publié', description: `Embed envoyé dans <#${channel.id}>.` })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return interaction.reply({ embeds: [buildError(err.message ?? 'Échec de publication.')], flags: MessageFlags.Ephemeral });
    }
  },
};
