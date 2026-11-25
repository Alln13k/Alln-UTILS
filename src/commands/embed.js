import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { incrementLeaks, getStats } from '../db.js';
import { buildEmbed, buildError } from '../embeds.js';
import { log } from '../logger.js';
import { requireStaff } from '../permissions.js';

export default {
  category: 'Publication',
  description: 'Envoie un embed noir dans n\'importe quel salon',
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Envoie un embed noir dans n\'importe quel salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addStringOption((opt) => opt.setName('titre').setDescription('Titre').setMaxLength(256).setRequired(true))
    .addStringOption((opt) => opt.setName('description').setDescription('Contenu').setMaxLength(4000).setRequired(true))
    .addChannelOption((opt) =>
      opt
        .setName('salon')
        .setDescription('Salon cible (par défaut : salon actuel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addStringOption((opt) => opt.setName('image').setDescription('URL d\'image').setMaxLength(1000).setRequired(false))
    .addStringOption((opt) => opt.setName('lien').setDescription('Lien attaché au titre').setMaxLength(1000).setRequired(false))
    .addRoleOption((opt) => opt.setName('ping').setDescription('Rôle à ping').setRequired(false)),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const config = getConfig();
      const title = interaction.options.getString('titre', true);
      const description = interaction.options.getString('description', true);
      const image = interaction.options.getString('image');
      const url = interaction.options.getString('lien');
      const ping = interaction.options.getRole('ping');
      const target = interaction.options.getChannel('salon') ?? interaction.channel;

      if (!target?.isTextBased()) {
        return interaction.reply({ embeds: [buildError('Salon cible invalide.')], flags: MessageFlags.Ephemeral });
      }

      const embed = buildEmbed({ dark: true, title, description, image, url });

      await target.send({
        content: ping ? `<@&${ping.id}>` : undefined,
        embeds: [embed],
        allowedMentions: { roles: ping ? [ping.id] : [] },
      });

      const isLeakChannel = config.leaksChannelId && target.id === config.leaksChannelId;
      if (isLeakChannel) incrementLeaks();

      await log(interaction.client, 'publication', 'embed', {
        guild: interaction.guild,
        fields: [
          { name: 'Salon', value: `<#${target.id}>`, inline: true },
          { name: 'Auteur', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Leak compté', value: isLeakChannel ? `oui (total ${getStats().leaksPublished})` : 'non', inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Embed publié', description: `Message envoyé dans <#${target.id}>.` })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error(`[alln-utils] /embed: ${err.stack ?? err.message}`);
      const payload = { embeds: [buildError('Envoi impossible.')], flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(() => null);
      return interaction.reply(payload).catch(() => null);
    }
  },
};
