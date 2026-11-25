import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getConfig, setConfigValue } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireAdmin, replyError } from '../permissions.js';

export default {
  category: 'Vocal',
  description: 'Configure les vocaux temporaires',
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Configure les vocaux temporaires')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Configure un paramètre vocal')
        .addChannelOption((opt) => opt.setName('hub').setDescription('Salon « rejoindre pour créer »').addChannelTypes(ChannelType.GuildVoice).setRequired(false))
        .addChannelOption((opt) => opt.setName('categorie').setDescription('Catégorie des vocaux temporaires').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
        .addIntegerOption((opt) => opt.setName('max').setDescription('Membres max par vocal').setMinValue(0).setMaxValue(99).setRequired(false)),
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Affiche la configuration')),

  async execute(interaction) {
    try {
      if (!(await requireAdmin(interaction))) return;
      const sub = interaction.options.getSubcommand();

      if (sub === 'config') {
        const hub = interaction.options.getChannel('hub');
        const category = interaction.options.getChannel('categorie');
        const max = interaction.options.getInteger('max');

        if (!hub && !category && max === null) {
          return replyError(interaction, 'Fournis au moins une option (`hub`, `categorie` ou `max`).');
        }

        if (hub) setConfigValue('voiceHubChannelId', hub.id);
        if (category) setConfigValue('voiceCategoryId', category.id);
        if (max !== null) setConfigValue('voiceMaxMembers', max);
      } else if (sub !== 'status') {
        return replyError(interaction, 'Sous-commande inconnue.');
      }

      const config = getConfig();
      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: 'Vocaux temporaires',
          fields: [
            { name: 'Salon déclencheur', value: config.voiceHubChannelId ? `<#${config.voiceHubChannelId}>` : 'non défini', inline: true },
            { name: 'Catégorie', value: config.voiceCategoryId ? `<#${config.voiceCategoryId}>` : 'non définie', inline: true },
            { name: 'Membres max', value: String(config.voiceMaxMembers), inline: true },
          ],
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Configuration vocale impossible.', '/voice');
    }
  },
};
