import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getConfig } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireStaff, replyError } from '../permissions.js';
import { acceptNsfw, revokeNsfw } from '../services/rulesGate.js';

export function buildNsfwPanel() {
  return {
    embeds: [buildEmbed({
      dark: true,
      title: '🔞 Vérification d\'âge',
      description: 'Tu dois confirmer être majeur pour accéder aux salons NSFW.\nClique sur le bouton ci-dessous pour obtenir l\'accès.',
    })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('nsfw_accept')
        .setLabel('Je suis majeur')
        .setEmoji('🔞')
        .setStyle(ButtonStyle.Danger),
    )],
  };
}

export default {
  category: 'Gating',
  description: 'Vérification d\'âge pour les salons NSFW',
  data: new SlashCommandBuilder()
    .setName('nsfw')
    .setDescription('Vérification d\'âge pour les salons NSFW')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Publie le panneau de vérification NSFW (staff)')
        .addChannelOption((opt) =>
          opt
            .setName('salon')
            .setDescription('Salon cible (défaut : nsfwChannelId)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName('accept').setDescription('Obtient l\'accès NSFW'))
    .addSubcommand((sub) =>
      sub
        .setName('revoke')
        .setDescription('Retire l\'accès NSFW (staff ou soi-même)')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre (défaut : toi)').setRequired(false)),
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();
      const config = getConfig();

      if (sub === 'panel') {
        if (!(await requireStaff(interaction))) return;
        if (!config.nsfwRoleId) return replyError(interaction, 'Configure d\'abord `nsfwRoleId`.');
        const target = interaction.options.getChannel('salon')
          ?? (config.nsfwChannelId
            ? await interaction.guild.channels.fetch(config.nsfwChannelId).catch(() => null)
            : interaction.channel);
        if (!target?.isTextBased()) return replyError(interaction, 'Salon cible invalide.');

        const message = await target.send(buildNsfwPanel());
        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Panneau NSFW publié',
            description: `Panneau envoyé dans <#${target.id}> (message \`${message.id}\`).`,
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'accept') {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) return replyError(interaction, 'Membre introuvable.');
        const result = await acceptNsfw(interaction.client, member, interaction.guild);
        if (!result.ok) return replyError(interaction, result.reason);
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Accès NSFW accordé', description: 'Le rôle NSFW t\'a été attribué.' })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'revoke') {
        const user = interaction.options.getUser('membre') ?? interaction.user;
        if (user.id !== interaction.user.id && !(await requireStaff(interaction))) return;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return replyError(interaction, 'Membre introuvable.');
        const result = await revokeNsfw(interaction.client, member, interaction.guild);
        if (!result.ok) return replyError(interaction, result.reason);
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Accès NSFW retiré', description: `Rôle retiré à <@${user.id}>.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Gestion NSFW impossible.', '/nsfw');
    }
  },
};
