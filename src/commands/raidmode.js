import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getConfig, setConfigValue } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireAdmin } from '../permissions.js';

function statusEmbed(extra = null) {
  const config = getConfig();
  return buildEmbed({
    dark: true,
    title: 'Raid mode',
    description: extra,
    fields: [
      { name: 'Activé', value: config.raidModeEnabled ? '✅ oui' : '❌ non', inline: true },
      {
        name: 'Salons verrouillés',
        value: config.raidModeLockedChannels?.length
          ? config.raidModeLockedChannels.map((id) => `<#${id}>`).join(', ')
          : 'aucun salon configuré',
        inline: false,
      },
    ],
  });
}

export default {
  category: 'Anti-raid',
  description: 'Verrouille le serveur en cas de raid',
  data: new SlashCommandBuilder()
    .setName('raidmode')
    .setDescription('Verrouille le serveur en cas de raid')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('enable').setDescription('Active le raid mode et verrouille les salons'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Désactive le raid mode et restaure les salons'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Affiche l\'état du raid mode')),

  async execute(interaction) {
    try {
      if (!(await requireAdmin(interaction))) return;

      const sub = interaction.options.getSubcommand();
      const config = getConfig();

      if (sub === 'status') {
        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      const channels = config.raidModeLockedChannels ?? [];
      let changed = 0;

      if (sub === 'enable') {
        for (const channelId of channels) {
          const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
          if (!channel?.permissionOverwrites) continue;
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
            SendMessages: false,
            SendMessagesInThreads: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false,
          }, { reason: 'Raid mode activé' }).catch((err) => {
            console.error(`[alln-utils] raid mode lock ${channelId}: ${err.message}`);
          });
          changed += 1;
        }

        setConfigValue('raidModeEnabled', true);

        await log(interaction.client, 'security', 'raidModeEnable', {
          guild: interaction.guild,
          fields: [
            { name: 'Salons verrouillés', value: String(changed), inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [statusEmbed(`Raid mode **activé** — ${changed} salon(s) verrouillé(s).`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'disable') {
        for (const channelId of channels) {
          const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
          if (!channel?.permissionOverwrites) continue;
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
            SendMessages: null,
            SendMessagesInThreads: null,
            CreatePublicThreads: null,
            CreatePrivateThreads: null,
          }, { reason: 'Raid mode désactivé' }).catch((err) => {
            console.error(`[alln-utils] raid mode unlock ${channelId}: ${err.message}`);
          });
          changed += 1;
        }

        setConfigValue('raidModeEnabled', false);

        await log(interaction.client, 'security', 'raidModeDisable', {
          guild: interaction.guild,
          fields: [
            { name: 'Salons restaurés', value: String(changed), inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [statusEmbed(`Raid mode **désactivé** — ${changed} salon(s) restauré(s).`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Raid mode impossible.', '/raidmode');
    }
  },
};
