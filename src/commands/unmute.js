import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Modération',
  description: 'Retire le timeout d\'un membre',
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Retire le timeout d\'un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('membre').setDescription('Membre à unmute').setRequired(true)),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const targetUser = interaction.options.getUser('membre', true);
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      if (!targetMember) return replyError(interaction, 'Ce membre n\'est pas sur le serveur.');
      if (!targetMember.isCommunicationDisabled()) return replyError(interaction, 'Ce membre n\'est pas en timeout.');
      if (!targetMember.moderatable) return replyError(interaction, 'Ce membre ne peut pas être unmute : rôle supérieur ou permissions insuffisantes.');

      await targetMember.timeout(null, `Unmute par ${interaction.user.tag}`);

      await log(interaction.client, 'moderation', 'unmute', {
        guild: interaction.guild,
        title: 'Unmute',
        fields: [
          { name: 'Cible', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
          { name: 'ID', value: targetUser.id, inline: true },
          { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Action', value: 'unmute', inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Membre unmute', description: `<@${targetUser.id}> n'est plus en timeout.` })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Unmute impossible. Vérifie mes permissions et la hiérarchie des rôles.', '/unmute');
    }
  },
};
