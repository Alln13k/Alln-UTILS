import {
  ChannelType,
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
  description: 'Publie un embed noir, avec image',
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Publie un embed personnalisé avec image')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption((opt) => opt.setName('titre').setDescription('Titre de l\'embed').setMaxLength(256).setRequired(true))
    .addStringOption((opt) => opt.setName('description').setDescription('Description de l\'embed').setMaxLength(4000).setRequired(true))
    .addChannelOption((opt) => opt
      .setName('salon')
      .setDescription('Salon de destination')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false))
    .addStringOption((opt) => opt.setName('image').setDescription('URL de l\'image à afficher').setMaxLength(1000).setRequired(false))
    .addAttachmentOption((opt) => opt.setName('fichier').setDescription('Ou joins directement un fichier image').setRequired(false))
    .addStringOption((opt) => opt.setName('lien').setDescription('Lien attaché au titre').setMaxLength(1000).setRequired(false))
    .addRoleOption((opt) => opt.setName('ping').setDescription('Rôle à ping').setRequired(false)),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    try {
      const titre = interaction.options.getString('titre', true);
      const description = interaction.options.getString('description', true);
      const channel = interaction.options.getChannel('salon') ?? interaction.channel;
      const file = interaction.options.getAttachment('fichier');
      const urlImage = interaction.options.getString('image');
      const urlTitre = interaction.options.getString('lien');
      const ping = interaction.options.getRole('ping');

      if (!channel?.isTextBased?.()) {
        return safeReply(interaction, {
          embeds: [buildError('Le salon choisi n’accepte pas les messages.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (file && !file.contentType?.startsWith('image/')) {
        return safeReply(interaction, {
          embeds: [buildError('Le fichier joint doit être une image.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Le fichier joint prend le pas sur une URL si les deux sont donnés.
      const image = file?.url ?? urlImage ?? undefined;
      if (image && !/^https?:\/\//i.test(image)) {
        return safeReply(interaction, {
          embeds: [buildError('L’URL de l’image doit commencer par http:// ou https://.')],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (urlTitre && !/^https?:\/\//i.test(urlTitre)) {
        return safeReply(interaction, {
          embeds: [buildError('Le lien du titre doit commencer par http:// ou https://.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      await channel.send({
        content: ping ? `<@&${ping.id}>` : undefined,
        embeds: [buildEmbed({ dark: true, title: titre, description, image, url: urlTitre })],
        allowedMentions: { roles: ping ? [ping.id] : [] },
      });

      await log(interaction.client, 'config', 'changed', {
        guild: interaction.guild,
        title: 'Embed publié',
        fields: [
          { name: 'Salon', value: `<#${channel.id}>`, inline: true },
          { name: 'Titre', value: titre.slice(0, 1000), inline: false },
          { name: 'Image', value: image ? 'oui' : 'non', inline: true },
          { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
        ],
      }).catch(() => null);

      return safeReply(interaction, {
        embeds: [buildEmbed({
          dark: true,
          title: 'Embed publié',
          description: `Embed envoyé dans <#${channel.id}>.`,
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error(`[alln-utils] /embed: ${err.stack ?? err.message}`);
      return safeReply(interaction, {
        embeds: [buildError('Envoi impossible. Vérifiez l’URL de l’image et mes permissions dans le salon.')],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
