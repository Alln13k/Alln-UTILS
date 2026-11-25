import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getConfig, setConfigValue } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireAdmin } from '../permissions.js';

function statusEmbed() {
  const config = getConfig();
  return buildEmbed({
    dark: true,
    title: 'Piège à raid',
    fields: [
      { name: 'Activé', value: config.raidTrapEnabled ? '✅ oui' : '❌ non', inline: true },
      { name: 'Salon piège', value: config.raidTrapChannelId ? `<#${config.raidTrapChannelId}>` : 'non défini', inline: true },
      { name: 'Raison du ban', value: String(config.raidTrapBanReason ?? 'raid trap').slice(0, 500), inline: false },
      {
        name: 'Whitelist',
        value: config.raidTrapWhitelist?.length
          ? config.raidTrapWhitelist.map((id) => `<@&${id}>`).join(', ')
          : 'aucun rôle',
        inline: false,
      },
    ],
  });
}

export default {
  category: 'Anti-raid',
  description: 'Configure le salon piège à raid',
  data: new SlashCommandBuilder()
    .setName('raidtrap')
    .setDescription('Configure le salon piège à raid')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('enable').setDescription('Active le piège à raid'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Désactive le piège à raid'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Affiche l\'état du piège'))
    .addSubcommandGroup((group) =>
      group
        .setName('set')
        .setDescription('Modifie la configuration du piège')
        .addSubcommand((sub) =>
          sub
            .setName('channel')
            .setDescription('Définit le salon piège')
            .addChannelOption((opt) => opt.setName('salon').setDescription('Salon piège').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('reason')
            .setDescription('Définit la raison du ban')
            .addStringOption((opt) => opt.setName('texte').setDescription('Raison').setMaxLength(400).setRequired(true)),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('whitelist')
        .setDescription('Gère les rôles ignorés')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Ignore un rôle')
            .addRoleOption((opt) => opt.setName('role').setDescription('Rôle à whitelister').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Retire un rôle de la whitelist')
            .addRoleOption((opt) => opt.setName('role').setDescription('Rôle à retirer').setRequired(true)),
        ),
    ),

  async execute(interaction) {
    try {
      if (!(await requireAdmin(interaction))) return;

      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand();

      if (!group && sub === 'enable') {
        setConfigValue('raidTrapEnabled', true);
        await log(interaction.client, 'security', 'raidTrapEnable', {
          guild: interaction.guild,
          fields: [{ name: 'Par', value: `<@${interaction.user.id}>`, inline: true }],
        });
        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      if (!group && sub === 'disable') {
        setConfigValue('raidTrapEnabled', false);
        await log(interaction.client, 'security', 'raidTrapDisable', {
          guild: interaction.guild,
          fields: [{ name: 'Par', value: `<@${interaction.user.id}>`, inline: true }],
        });
        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      if (!group && sub === 'status') {
        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      if (group === 'set' && sub === 'channel') {
        const channel = interaction.options.getChannel('salon', true);
        setConfigValue('raidTrapChannelId', channel.id);
        await log(interaction.client, 'security', 'raidTrapConfig', {
          guild: interaction.guild,
          title: 'Raid trap — salon défini',
          fields: [
            { name: 'Salon', value: `<#${channel.id}>`, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });
        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      if (group === 'set' && sub === 'reason') {
        const reason = interaction.options.getString('texte', true);
        setConfigValue('raidTrapBanReason', reason);
        await log(interaction.client, 'security', 'raidTrapConfig', {
          guild: interaction.guild,
          title: 'Raid trap — raison définie',
          fields: [
            { name: 'Raison', value: reason.slice(0, 500), inline: false },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });
        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      if (group === 'whitelist' && sub === 'add') {
        const role = interaction.options.getRole('role', true);
        const list = [...(getConfig().raidTrapWhitelist ?? [])];
        if (!list.includes(role.id)) list.push(role.id);
        setConfigValue('raidTrapWhitelist', list);
        await log(interaction.client, 'security', 'raidTrapConfig', {
          guild: interaction.guild,
          title: 'Raid trap — whitelist add',
          fields: [
            { name: 'Rôle', value: `<@&${role.id}>`, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });
        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      if (group === 'whitelist' && sub === 'remove') {
        const role = interaction.options.getRole('role', true);
        const list = (getConfig().raidTrapWhitelist ?? []).filter((id) => id !== role.id);
        setConfigValue('raidTrapWhitelist', list);
        await log(interaction.client, 'security', 'raidTrapConfig', {
          guild: interaction.guild,
          title: 'Raid trap — whitelist remove',
          fields: [
            { name: 'Rôle', value: `<@&${role.id}>`, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });
        return interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Configuration du piège impossible.', '/raidtrap');
    }
  },
};
