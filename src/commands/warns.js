import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { listWarns } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Modération',
  description: 'Liste les avertissements d\'un membre',
  data: new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Liste les avertissements d\'un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true)),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const user = interaction.options.getUser('membre', true);
      const warns = listWarns(user.id);
      if (warns.length === 0) {
        return replyError(interaction, `<@${user.id}> n'a aucun avertissement.`);
      }

      const lines = warns.slice(0, 15).map((warn, index) => {
        const date = Math.floor(new Date(warn.createdAt).getTime() / 1000);
        return `**#${index + 1}** — <t:${date}:d> — <@${warn.moderator}> — ${warn.reason}`;
      });

      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: `Warns — ${user.tag}`,
          description: lines.join('\n').slice(0, 4000),
          fields: [{ name: 'Total', value: String(warns.length), inline: true }],
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Liste des warns impossible.', '/warns');
    }
  },
};
