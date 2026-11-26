import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed, buildError } from '../embeds.js';
import { log } from '../logger.js';
import { requireAdmin } from '../permissions.js';
import { safeDefer, safeReply } from '../respond.js';
import { getConfig } from '../config.js';

export default {
  category: 'Utilitaire',
  description: 'Affiche le panneau de règles',
  data: new SlashCommandBuilder()
    .setName('rules_panel')
    .setDescription('Affiche le panneau d\'acceptation des règles')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const config = getConfig();
    if (!config.verifiedRoleId) {
      return safeReply(interaction, {
        embeds: [buildError('Aucun rôle vérifié configuré (`verifiedRoleId`). Configure-le dans `/config`.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!(await safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rules_accept')
        .setLabel('J’accepte le règlement')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
    );

    const panel = await interaction.channel.send({
      embeds: [buildEmbed({
        dark: true,
        title: 'Règlement',
        description: 'Clique sur le bouton ci-dessous pour accepter le règlement et obtenir le rôle vérifié.',
      })],
      components: [row],
    }).catch(() => null);

    if (!panel) {
      return safeReply(interaction, {
        embeds: [buildError('Impossible de publier le panneau. Vérifie les permissions du bot dans ce salon.')],
      });
    }

    await log(interaction.client, 'rules', 'panel', {
      guild: interaction.guild,
      fields: [
        { name: 'Salon', value: `<#${interaction.channelId}>`, inline: true },
        { name: 'Message', value: `[Panneau](${panel.url})`, inline: true },
        { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });

    return safeReply(interaction, {
      embeds: [buildEmbed({ dark: true, title: 'Panneau règles', description: 'Panneau publié.' })],
    });
  },
};
