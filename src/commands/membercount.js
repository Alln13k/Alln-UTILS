import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getConfig, setConfigValue } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireAdmin, replyError } from '../permissions.js';
import {
  ensureBotInChannel,
  memberCountStatus,
  restartMemberCountService,
  startMemberCountService,
  stopMemberCountService,
  updateMemberCount,
} from '../membercount.js';

function statusEmbed() {
  const config = getConfig();
  const status = memberCountStatus();
  return buildEmbed({
    dark: true,
    title: 'Compteur de membres',
    fields: [
      { name: 'Salon', value: config.memberCountChannelId ? `<#${config.memberCountChannelId}>` : 'non défini', inline: true },
      { name: 'Service', value: config.memberCountEnabled && status.started ? '✅ actif' : '❌ inactif', inline: true },
      { name: 'Connecté au vocal', value: status.connected ? '✅ oui' : '❌ non', inline: true },
      { name: 'Template', value: `\`${config.memberCountTemplate}\``, inline: false },
      { name: 'Intervalle', value: `${config.memberCountUpdateSeconds}s`, inline: true },
      { name: 'Inclure les bots', value: config.memberCountIncludeBots ? 'oui' : 'non', inline: true },
      { name: 'Dernier rename', value: status.lastRenameAt ? `<t:${Math.floor(status.lastRenameAt / 1000)}:R>` : 'aucun', inline: true },
    ],
  });
}

export default {
  category: 'Vocal',
  description: 'Configure le salon vocal compteur de membres',
  data: new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Configure le salon vocal compteur de membres')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Définit le salon vocal compteur')
        .addChannelOption((opt) => opt.setName('vocal').setDescription('Salon vocal').addChannelTypes(ChannelType.GuildVoice).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('template')
        .setDescription('Définit le template du nom')
        .addStringOption((opt) => opt.setName('texte').setDescription('Variables : {count}, {online}, {boosts}, {humans}').setMaxLength(100).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('interval')
        .setDescription('Définit la fréquence de mise à jour')
        .addIntegerOption((opt) => opt.setName('secondes').setDescription('Minimum 120').setMinValue(120).setMaxValue(3600).setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('toggle').setDescription('Active ou désactive le service'))
    .addSubcommand((sub) => sub.setName('refresh').setDescription('Force une mise à jour et une reconnexion'))
    .addSubcommand((sub) => sub.setName('status').setDescription('État du compteur')),

  async execute(interaction) {
    try {
      if (!(await requireAdmin(interaction))) return;
      const sub = interaction.options.getSubcommand();
      const config = getConfig();

      if (sub === 'setup') {
        const channel = interaction.options.getChannel('vocal', true);
        setConfigValue('memberCountChannelId', channel.id);
        setConfigValue('memberCountEnabled', true);
        await restartMemberCountService(interaction.client);

        await log(interaction.client, 'config', 'changed', {
          guild: interaction.guild,
          title: 'Compteur de membres configuré',
          fields: [
            { name: 'Salon', value: `<#${channel.id}>`, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'template') {
        const template = interaction.options.getString('texte', true);
        setConfigValue('memberCountTemplate', template);
        await updateMemberCount(interaction.client, { force: true });
        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'interval') {
        const seconds = interaction.options.getInteger('secondes', true);
        if (seconds < 120) {
          return replyError(interaction, 'Intervalle refusé : Discord limite les renommages de salons vocaux. Minimum 120 secondes.');
        }
        setConfigValue('memberCountUpdateSeconds', seconds);
        await restartMemberCountService(interaction.client);
        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'toggle') {
        const next = !config.memberCountEnabled;
        setConfigValue('memberCountEnabled', next);
        if (next) await startMemberCountService(interaction.client);
        else stopMemberCountService(interaction.client);
        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'refresh') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await ensureBotInChannel(interaction.client);
        await updateMemberCount(interaction.client, { force: true });

        await log(interaction.client, 'voice', 'memberCountReconnect', {
          guild: interaction.guild,
          title: 'Compteur — rafraîchissement manuel',
          description: 'Reconnexion et mise à jour forcées par un administrateur.',
          fields: [{ name: 'Par', value: `<@${interaction.user.id}>`, inline: true }],
        });

        return interaction.editReply({ embeds: [statusEmbed()] });
      }

      if (sub === 'status') {
        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      return replyError(interaction, 'Sous-commande inconnue.');
    } catch (err) {
      return fail(interaction, err, 'Action compteur impossible.', '/membercount');
    }
  },
};
