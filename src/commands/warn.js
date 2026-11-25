import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { addWarn, countWarns } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';
import { applyWarnThresholds, nextWarnThreshold } from '../warnSystem.js';

export default {
  category: 'Modération',
  description: 'Ajoute un avertissement à un membre',
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Ajoute un avertissement à un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('membre').setDescription('Membre à avertir').setRequired(true))
    .addStringOption((opt) => opt.setName('raison').setDescription('Raison').setMaxLength(500).setRequired(true)),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const user = interaction.options.getUser('membre', true);
      const reason = interaction.options.getString('raison', true);

      if (user.id === interaction.user.id) return replyError(interaction, 'Tu ne peux pas te warn toi-même.');

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return replyError(interaction, 'Ce membre n\'est pas sur le serveur.');

      const count = addWarn(user.id, {
        moderator: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
      });

      await log(interaction.client, 'moderation', 'warn', {
        guild: interaction.guild,
        fields: [
          { name: 'Cible', value: `<@${user.id}> (${user.tag})`, inline: true },
          { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Total warns', value: String(count), inline: true },
          { name: 'Raison', value: reason.slice(0, 1000), inline: false },
        ],
      });

      const result = await applyWarnThresholds(interaction.client, interaction.guild, member, {
        moderator: interaction.user.id,
        reason,
      });

      const next = nextWarnThreshold(count);
      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: 'Avertissement ajouté',
          description: `<@${user.id}> a reçu un warn (**${count}** au total).`,
          fields: [
            { name: 'Raison', value: reason.slice(0, 1000), inline: false },
            { name: 'Action automatique', value: result.action ? result.action : 'aucune', inline: true },
            { name: 'Prochain palier', value: next ? `${next.action} à ${next.at} warns` : 'aucun', inline: true },
          ],
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Warn impossible.', '/warn');
    }
  },
};

export { countWarns };
