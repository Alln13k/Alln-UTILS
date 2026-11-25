import {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getConfig } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

const RULES = [
  '1. Respecte tous les membres et évite toute discrimination, insulte ou harcèlement.',
  '2. Aucun scam, phishing, arnaque ou lien malveillant n\'est toléré.',
  '3. Ne publie pas de contenu NSFW en dehors des salons prévus à cet effet.',
  '4. Pas de spam, de pub non autorisée ni de bump abusif.',
  '5. Les leaks et tools doivent être partagés dans les salons dédiés.',
  '6. Utilise les tickets pour toute demande au staff.',
  '7. En cas de doute, contacte le staff plutôt que d\'agir seul.',
];

export default {
  category: 'Gating',
  description: 'Publie le panneau de règles avec vérification',
  data: new SlashCommandBuilder()
    .setName('rules_panel')
    .setDescription('Publie le panneau de règles avec vérification')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addChannelOption((opt) =>
      opt
        .setName('salon')
        .setDescription('Salon cible (défaut : rulesChannelId ou salon actuel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const config = getConfig();
      const target = interaction.options.getChannel('salon')
        ?? (config.rulesChannelId
          ? await interaction.guild.channels.fetch(config.rulesChannelId).catch(() => null)
          : interaction.channel);

      if (!target?.isTextBased()) return replyError(interaction, 'Salon cible invalide.');
      if (!config.verifiedRoleId) {
        return replyError(interaction, 'Configure d\'abord `verifiedRoleId` via `/config set verifiedRoleId @rôle`.');
      }

      const message = await target.send({
        embeds: [buildEmbed({
          dark: true,
          title: '📜 Règlement — Alln UTILS',
          description: [
            'Pour accéder au serveur, lis les règles ci-dessous puis clique sur **J\'accepte**.',
            '',
            ...RULES,
          ].join('\n').slice(0, 4000),
          fields: [
            { name: 'Accès', value: 'Un rôle vérifié te sera attribué après acceptation.', inline: false },
          ],
        })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('rules_accept')
            .setLabel("J'accepte")
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
        )],
      });

      await log(interaction.client, 'publication', 'embed', {
        guild: interaction.guild,
        title: 'Panneau de règles publié',
        fields: [
          { name: 'Salon', value: `<#${target.id}>`, inline: true },
          { name: 'Message', value: message.id, inline: true },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Panneau publié', description: `Règlement envoyé dans <#${target.id}>.` })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Publication du règlement impossible.', '/rules_panel');
    }
  },
};

export { RULES };
