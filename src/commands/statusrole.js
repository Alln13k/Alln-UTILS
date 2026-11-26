import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed, buildError } from '../embeds.js';
import { log } from '../logger.js';
import { requireAdmin } from '../permissions.js';
import { setConfigValue, getConfig } from '../config.js';
import { reconcileAll } from '../services/statusRole.js';

export default {
  category: 'Configuration',
  description: 'Gère le watcher de statut → rôle',
  data: new SlashCommandBuilder()
    .setName('statusrole')
    .setDescription('Gère le watcher de statut automatique')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('enable').setDescription('Active le watcher de statut'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Désactive le watcher de statut'))
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Définit un paramètre')
        .addStringOption((opt) => opt.setName('cle').setDescription('Clé (text, role, mode, sweep)').setRequired(true))
        .addStringOption((opt) => opt.setName('valeur').setDescription('Valeur').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('exempt')
        .setDescription('Gère les rôles exemptés')
        .addStringOption((opt) => opt.setName('action').setDescription('add ou remove').setRequired(true))
        .addRoleOption((opt) => opt.setName('role').setDescription('Rôle').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Affiche l\'état du watcher'))
    .addSubcommand((sub) => sub.setName('refresh').setDescription('Force un balayage immédiat')),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const sub = interaction.options.getSubcommand();
    const config = getConfig();

    if (sub === 'enable') {
      await setConfigValue('statusRoleEnabled', true);
      return interaction.reply({ embeds: [buildEmbed({ dark: true, title: 'StatusRole', description: 'Watcher de statut activé.' })], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'disable') {
      await setConfigValue('statusRoleEnabled', false);
      return interaction.reply({ embeds: [buildEmbed({ dark: true, title: 'StatusRole', description: 'Watcher de statut désactivé.' })], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'set') {
      const cle = interaction.options.getString('cle', true).toLowerCase();
      const valeur = interaction.options.getString('valeur', true);
      const allowed = ['text', 'role', 'mode', 'sweep'];
      if (!allowed.includes(cle)) return interaction.reply({ embeds: [buildError('Clé invalide. Utilise: text, role, mode ou sweep.')], flags: MessageFlags.Ephemeral });

      if (cle === 'text') {
        await setConfigValue('statusRoleText', valeur);
      } else if (cle === 'role') {
        const id = valeur.match(/^<@&(\d+)>$/)?.[1] ?? valeur.match(/^\d{15,25}$/)?.[0];
        const role = id ? await interaction.guild.roles.fetch(id).catch(() => null) : null;
        if (!role) return interaction.reply({ embeds: [buildError('Rôle introuvable.')], flags: MessageFlags.Ephemeral });
        await setConfigValue('statusRoleId', role.id);
      } else if (cle === 'mode') {
        if (!['contains', 'exact', 'startswith'].includes(valeur.toLowerCase())) {
          return interaction.reply({ embeds: [buildError('Mode invalide. Utilise: contains, exact ou startswith.')], flags: MessageFlags.Ephemeral });
        }
        await setConfigValue('statusRoleMatchMode', valeur.toLowerCase());
      } else if (cle === 'sweep') {
        const secondes = Number.parseInt(valeur, 10);
        if (!Number.isFinite(secondes) || secondes < 2) return interaction.reply({ embeds: [buildError('Nombre de secondes invalide (min 2).')], flags: MessageFlags.Ephemeral });
        await setConfigValue('statusRoleSweepSeconds', secondes);
      }

      await log(interaction.client, 'config', 'changed', {
        guild: interaction.guild,
        fields: [
          { name: 'Clé', value: cle, inline: true },
          { name: 'Valeur', value: valeur, inline: true },
          { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });
      return interaction.reply({ embeds: [buildEmbed({ dark: true, title: 'StatusRole', description: `\`${cle}\` défini sur \`${valeur}\`.` })], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'exempt') {
      const action = interaction.options.getString('action', true).toLowerCase();
      const role = interaction.options.getRole('role', true);
      const current = config.statusRoleExemptRoleIds ?? [];
      if (action === 'add') {
        if (!current.includes(role.id)) current.push(role.id);
        await setConfigValue('statusRoleExemptRoleIds', current);
      } else if (action === 'remove') {
        const next = current.filter((id) => id !== role.id);
        await setConfigValue('statusRoleExemptRoleIds', next);
      } else {
        return interaction.reply({ embeds: [buildError('Action invalide. Utilise: add ou remove.')], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ embeds: [buildEmbed({ dark: true, title: 'StatusRole', description: `Rôle ${action === 'add' ? 'ajouté' : 'retiré'} des exemptions.` })], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'status') {
      const holders = interaction.guild.members.cache.filter((m) => !m.user.bot && m.roles.cache.has(config.statusRoleId ?? '')).size;
      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: 'StatusRole — État',
          fields: [
            { name: 'Activé', value: config.statusRoleEnabled ? 'Oui' : 'Non', inline: true },
            { name: 'Texte', value: config.statusRoleText ?? '(aucun)', inline: true },
            { name: 'Rôle', value: config.statusRoleId ? `<@&${config.statusRoleId}>` : '(aucun)', inline: true },
            { name: 'Mode', value: config.statusRoleMatchMode ?? 'contains', inline: true },
            { name: 'Balayage', value: `${config.statusRoleSweepSeconds ?? 2}s`, inline: true },
            { name: 'Porteurs actuels', value: String(holders), inline: true },
          ],
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'refresh') {
      const guild = interaction.guild;
      await reconcileAll(interaction.client, guild);
      return interaction.reply({ embeds: [buildEmbed({ dark: true, title: 'StatusRole', description: 'Balayage forcé terminé.' })], flags: MessageFlags.Ephemeral });
    }
  },
};
