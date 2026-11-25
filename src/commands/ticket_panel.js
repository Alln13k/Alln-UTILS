import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';
import { buildTicketPanelComponents } from '../handlers/buttons.js';

export default {
  category: 'Tickets',
  description: 'Envoie le panneau d\'ouverture de ticket',
  data: new SlashCommandBuilder()
    .setName('ticket_panel')
    .setDescription('Envoie le panneau d\'ouverture de ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addChannelOption((opt) =>
      opt
        .setName('salon')
        .setDescription('Salon où publier le panneau (par défaut : salon actuel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const config = getConfig();
      if (!config.ticketCategoryId) {
        return replyError(interaction, 'Configure d\'abord `ticketCategoryId` via `/config set ticketCategoryId #catégorie`.');
      }

      const target = interaction.options.getChannel('salon') ?? interaction.channel;

      if (!target || !target.isTextBased?.()) return replyError(interaction, 'Salon cible invalide.');

      const message = await target.send({
        embeds: [buildEmbed({
          dark: true,
          title: 'Support — Alln UTILS',
          description: [
            'Besoin d\'aide, d\'une vérification ou d\'un signalement ?',
            '',
            'Choisis une catégorie ci-dessous pour ouvrir un ticket privé.',
            `Limite : **${config.ticketLimitPerUser}** ticket(s) ouvert(s) par membre.`,
          ].join('\n'),
        })],
        components: buildTicketPanelComponents(),
      });

      await log(interaction.client, 'tickets', 'panel', {
        guild: interaction.guild,
        fields: [
          { name: 'Salon', value: `<#${target.id}>`, inline: true },
          { name: 'Message', value: message.id, inline: true },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Panneau publié', description: `Panneau de tickets envoyé dans <#${target.id}>.` })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Publication du panneau impossible.', '/ticket_panel');
    }
  },
};
