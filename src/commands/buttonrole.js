import {
  ActionRowBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { addButtonRole, listButtonRoles, removeButtonRole } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export function buildButtonRoleMenu() {
  const roles = listButtonRoles();
  if (roles.length === 0) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('buttonrole_select')
    .setPlaceholder('Choisis tes rôles')
    .setMinValues(0)
    .setMaxValues(Math.min(roles.length, 25))
    .addOptions(roles.slice(0, 25).map((entry) => ({
      label: entry.name.slice(0, 100),
      value: entry.roleId,
      emoji: entry.emoji || undefined,
      description: `Rôle ${entry.name}`.slice(0, 100),
    })));

  return new ActionRowBuilder().addComponents(menu);
}

export default {
  category: 'Engagement',
  description: 'Gère les rôles par menu de sélection',
  data: new SlashCommandBuilder()
    .setName('buttonrole')
    .setDescription('Gère les rôles par menu de sélection')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('panel').setDescription('Publie le menu de rôles'))
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Ajoute un rôle au menu')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nom affiché').setMaxLength(80).setRequired(true))
        .addRoleOption((opt) => opt.setName('role').setDescription('Rôle à donner').setRequired(true))
        .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji').setMaxLength(64).setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Retire un rôle du menu').addStringOption((opt) => opt.setName('nom').setDescription('Nom affiché').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les rôles du menu')),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const name = interaction.options.getString('nom', true).trim();
        const role = interaction.options.getRole('role', true);
        const emoji = interaction.options.getString('emoji') ?? null;

        const entry = addButtonRole({ name, roleId: role.id, emoji, createdBy: interaction.user.id });
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Rôle ajouté au menu', description: `${entry.emoji ?? '•'} **${entry.name}** → <@&${entry.roleId}>` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'remove') {
        const name = interaction.options.getString('nom', true);
        removeButtonRole(name);
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Rôle retiré', description: `**${name}** a été retiré du menu.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'list') {
        const roles = listButtonRoles();
        const description = roles.length
          ? roles.map((entry) => `${entry.emoji ?? '•'} **${entry.name}** → <@&${entry.roleId}>`).join('\n').slice(0, 4000)
          : 'Aucun rôle dans le menu.';
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Menu de rôles — ${roles.length}`, description })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'panel') {
        const row = buildButtonRoleMenu();
        if (!row) return replyError(interaction, 'Ajoute d\'abord des rôles avec `/buttonrole add`.');

        const message = await interaction.channel.send({
          embeds: [buildEmbed({
            dark: true,
            title: 'Rôles — Alln UTILS',
            description: 'Choisis les rôles qui t\'intéressent dans le menu ci-dessous. Tu peux modifier ton choix à tout moment.',
          })],
          components: [row],
        });

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Panneau publié', description: `Menu envoyé : [voir le message](${message.url}).` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action menu de rôles impossible.', '/buttonrole');
    }
  },
};
