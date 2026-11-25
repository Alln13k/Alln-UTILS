import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getLevelTiers, removeLevelTier, setLevelTier } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireAdmin, replyError } from '../permissions.js';
import { levelFromXp, topLevels } from '../services/levels.js';

export default {
  category: 'Niveaux',
  description: 'Classement et paliers de niveaux',
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('Classement et paliers de niveaux')
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('top').setDescription('Top 10 du serveur'))
    .addSubcommand((sub) => sub.setName('tiers').setDescription('Liste les paliers configurés'))
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Configure un palier (admin)')
        .addIntegerOption((opt) => opt.setName('niveau').setDescription('Niveau').setMinValue(1).setMaxValue(1000).setRequired(true))
        .addRoleOption((opt) => opt.setName('role').setDescription('Rôle à attribuer (omis = suppression)').setRequired(false)),
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'top') {
        const top = topLevels(10);
        const description = top.length
          ? top.map((entry, index) => `**${index + 1}.** <@${entry.userId}> — niveau **${entry.level}** (${entry.xp} XP)`).join('\n')
          : 'Aucune activité enregistrée.';
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Classement des niveaux', description })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'tiers') {
        const tiers = getLevelTiers();
        const entries = Object.entries(tiers).sort(([a], [b]) => Number(a) - Number(b));
        const description = entries.length
          ? entries.map(([level, roleId]) => `Niveau **${level}** → <@&${roleId}>`).join('\n')
          : 'Aucun palier configuré.';
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Paliers de niveaux', description })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'config') {
        if (!(await requireAdmin(interaction))) return;
        const level = interaction.options.getInteger('niveau', true);
        const role = interaction.options.getRole('role');

        if (!role) {
          removeLevelTier(level);
          return interaction.reply({
            embeds: [buildEmbed({ dark: true, title: 'Palier supprimé', description: `Le palier niveau **${level}** a été retiré.` })],
            flags: MessageFlags.Ephemeral,
          });
        }

        setLevelTier(level, role.id);
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Palier enregistré', description: `Niveau **${level}** → <@&${role.id}>` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return replyError(interaction, 'Sous-commande inconnue.');
    } catch (err) {
      return fail(interaction, err, 'Action niveaux impossible.', '/levels');
    }
  },
};

export { levelFromXp, PermissionFlagsBits };
