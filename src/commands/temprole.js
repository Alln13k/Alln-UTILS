import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { addTempRole, listTempRoles, removeTempRole } from '../db.js';
import { durationLabel, formatRemaining, parseDuration } from '../duration.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';
import { createTempRoleEntry, registerTempRole, unregisterTempRole } from '../services/temproles.js';

export default {
  category: 'Modération',
  description: 'Gère les rôles temporaires',
  data: new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Gère les rôles temporaires')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Attribue un rôle temporaire')
        .addUserOption((opt) => opt.setName('user').setDescription('Membre').setRequired(true))
        .addRoleOption((opt) => opt.setName('role').setDescription('Rôle').setRequired(true))
        .addStringOption((opt) => opt.setName('duree').setDescription('Durée (ex : 30m, 2h, 7d)').setMaxLength(20).setRequired(true))
        .addStringOption((opt) => opt.setName('raison').setDescription('Raison').setMaxLength(300).setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Liste les rôles temporaires')
        .addUserOption((opt) => opt.setName('user').setDescription('Membre (optionnel)').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Retire un rôle temporaire')
        .addUserOption((opt) => opt.setName('user').setDescription('Membre').setRequired(true))
        .addRoleOption((opt) => opt.setName('role').setDescription('Rôle').setRequired(true)),
    ),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const user = interaction.options.getUser('user', true);
        const role = interaction.options.getRole('role', true);
        const ms = parseDuration(interaction.options.getString('duree', true));
        if (!ms) return replyError(interaction, 'Durée invalide. Exemples : `30s`, `2h`, `7d`.');

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return replyError(interaction, 'Membre introuvable.');

        const reason = interaction.options.getString('raison')?.trim() ?? null;
        const entry = createTempRoleEntry({
          userId: user.id,
          roleId: role.id,
          guildId: interaction.guild.id,
          expiresAt: new Date(Date.now() + ms).toISOString(),
          addedBy: interaction.user.id,
          reason,
        });

        await member.roles.add(role.id, `Rôle temporaire — ${reason ?? 'temprole'}`).catch(() => null);
        addTempRole(entry);
        registerTempRole(interaction.client, entry);

        await log(interaction.client, 'temprole', 'add', {
          guild: interaction.guild,
          fields: [
            { name: 'Membre', value: `<@${user.id}>`, inline: true },
            { name: 'Rôle', value: `<@&${role.id}>`, inline: true },
            { name: 'Durée', value: durationLabel(ms), inline: true },
            { name: 'Expire', value: `<t:${Math.floor(new Date(entry.expiresAt).getTime() / 1000)}:R>`, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Rôle temporaire attribué',
            description: `<@${user.id}> reçoit <@&${role.id}> pendant **${durationLabel(ms)}**.`,
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'list') {
        const user = interaction.options.getUser('user');
        const entries = listTempRoles(user?.id ?? null).sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
        const description = entries.length
          ? entries.map((entry) => `**${entry.id.slice(0, 8)}** — <@${entry.userId}> — <@&${entry.roleId}> — ${formatRemaining(new Date(entry.expiresAt).getTime() - Date.now())} (<t:${Math.floor(new Date(entry.expiresAt).getTime() / 1000)}:R>)`).join('\n')
          : 'Aucun rôle temporaire actif.';

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Rôles temporaires — ${entries.length}`, description: description.slice(0, 4000) })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'remove') {
        const user = interaction.options.getUser('user', true);
        const role = interaction.options.getRole('role', true);
        const entry = removeTempRole(user.id, role.id);
        unregisterTempRole(entry.id);

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member) await member.roles.remove(role.id, 'Rôle temporaire retiré manuellement').catch(() => null);

        await log(interaction.client, 'temprole', 'remove', {
          guild: interaction.guild,
          fields: [
            { name: 'Membre', value: `<@${user.id}>`, inline: true },
            { name: 'Rôle', value: `<@&${role.id}>`, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Restait', value: formatRemaining(new Date(entry.expiresAt).getTime() - Date.now()), inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Rôle temporaire retiré', description: `<@&${role.id}> retiré à <@${user.id}>.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Gestion des rôles temporaires impossible.', '/temprole');
    }
  },
};
