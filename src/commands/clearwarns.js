import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { clearWarns, countWarns } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Modération',
  description: 'Supprime tous les warns d\'un membre',
  data: new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Supprime tous les warns d\'un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption((opt) => opt.setName('confirmation').setDescription('Écris CONFIRM pour valider').setMaxLength(16).setRequired(true)),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const user = interaction.options.getUser('membre', true);
      const confirmation = interaction.options.getString('confirmation', true).trim();
      if (confirmation !== 'CONFIRM') return replyError(interaction, 'Confirmation invalide. Écris exactement `CONFIRM`.');

      const count = countWarns(user.id);
      if (count === 0) return replyError(interaction, `<@${user.id}> n'a aucun warn.`);

      clearWarns(user.id);

      await log(interaction.client, 'moderation', 'clearwarns', {
        guild: interaction.guild,
        fields: [
          { name: 'Cible', value: `<@${user.id}> (${user.tag})`, inline: true },
          { name: 'Warns supprimés', value: String(count), inline: true },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Warns effacés', description: `${count} warn(s) supprimé(s) pour <@${user.id}>.` })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Clearwarns impossible.', '/clearwarns');
    }
  },
};
