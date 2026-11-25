import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config.js';
import { saveAnnouncement } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

const lastByStaff = new Map();

export default {
  category: 'Publication',
  description: 'Publie une annonce avec ping et détails',
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Publie une annonce avec ping et détails')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addStringOption((opt) => opt.setName('titre').setDescription('Titre de l\'annonce').setMaxLength(200).setRequired(true))
    .addStringOption((opt) => opt.setName('description').setDescription('Description courte').setMaxLength(2000).setRequired(true))
    .addRoleOption((opt) => opt.setName('role').setDescription('Rôle à ping').setRequired(false))
    .addStringOption((opt) => opt.setName('lien').setDescription('Lien des détails').setMaxLength(500).setRequired(false))
    .addStringOption((opt) => opt.setName('details').setDescription('Description longue (bouton Voir les détails)').setMaxLength(4000).setRequired(false))
    .addChannelOption((opt) =>
      opt
        .setName('salon')
        .setDescription('Salon cible (défaut : salon actuel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const config = getConfig();
      const cooldownMs = Math.max(60, Number(config.announceCooldownSeconds) || 3600) * 1000;
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const last = lastByStaff.get(key) ?? 0;
      if (Date.now() - last < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - (Date.now() - last)) / 1000);
        return replyError(interaction, `Attends encore **${remaining} seconde(s)** avant une nouvelle annonce.`);
      }

      const title = interaction.options.getString('titre', true);
      const description = interaction.options.getString('description', true);
      const role = interaction.options.getRole('role');
      const link = interaction.options.getString('lien');
      const details = interaction.options.getString('details');
      const target = interaction.options.getChannel('salon') ?? interaction.channel;
      if (!target?.isTextBased()) return replyError(interaction, 'Salon cible invalide.');

      if (!link && !details) {
        return replyError(interaction, 'Fournis un `lien` ou une `details` pour le bouton « Voir les détails ».');
      }

      const id = randomUUID();
      saveAnnouncement(id, {
        title,
        description,
        details: details ?? null,
        link: link ?? null,
        authorId: interaction.user.id,
      });

      const button = link
        ? new ButtonBuilder()
          .setLabel('Voir les détails')
          .setStyle(ButtonStyle.Link)
          .setURL(link)
        : new ButtonBuilder()
          .setCustomId(`announce_details:${id}`)
          .setLabel('Voir les détails')
          .setStyle(ButtonStyle.Primary);

      const message = await target.send({
        content: role ? `<@&${role.id}>` : undefined,
        allowedMentions: { roles: role ? [role.id] : [] },
        embeds: [buildEmbed({
          dark: true,
          title: `📢 ${title}`,
          description,
          fields: [
            { name: 'Publiée par', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Détails', value: link ? 'lien externe' : 'description longue', inline: true },
          ],
        })],
        components: [new ActionRowBuilder().addComponents(button)],
      });

      lastByStaff.set(key, Date.now());

      await log(interaction.client, 'announce', 'send', {
        guild: interaction.guild,
        fields: [
          { name: 'Titre', value: title.slice(0, 300), inline: false },
          { name: 'Salon', value: `<#${target.id}>`, inline: true },
          { name: 'Message', value: message.id, inline: true },
          { name: 'Rôle ping', value: role ? `<@&${role.id}>` : 'aucun', inline: true },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Annonce publiée', description: `Annonce envoyée dans <#${target.id}>.` })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Publication de l\'annonce impossible.', '/announce');
    }
  },
};

export function clearAnnounceCooldown(guildId, userId) {
  lastByStaff.delete(`${guildId}:${userId}`);
}
