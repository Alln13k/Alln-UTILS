import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  countOpenTicketsFor,
  getInviteCounts,
  getLevelUser,
  isBlacklisted,
  listNotes,
  listWarns,
  vouchsGiven,
  vouchsReceived,
} from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireStaff } from '../permissions.js';
import { levelProgress } from '../services/levels.js';

export default {
  category: 'Modération',
  description: 'Historique consolidé d\'un membre',
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Historique consolidé d\'un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true)),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const user = interaction.options.getUser('membre', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const warns = listWarns(user.id);
      const notes = listNotes(user.id);
      const invites = getInviteCounts(user.id);
      const level = levelProgress(getLevelUser(user.id).xp);
      const blacklisted = isBlacklisted(user.id);

      const warnLines = warns.slice(0, 5).map((warn) => `• ${warn.reason}`).join('\n');

      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: `Historique — ${user.tag}`,
          thumbnail: user.displayAvatarURL({ size: 128 }),
          fields: [
            { name: 'Compte créé', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: true },
            { name: 'Arrivée', value: member?.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>` : 'inconnue', inline: true },
            { name: 'Blacklist', value: blacklisted ? '❌ oui' : '✅ non', inline: true },
            { name: 'Warns', value: `${warns.length}${warnLines ? `\n${warnLines}` : ''}`.slice(0, 1024), inline: false },
            { name: 'Notes staff', value: String(notes.length), inline: true },
            { name: 'Tickets ouverts', value: String(countOpenTicketsFor(user.id)), inline: true },
            { name: 'Vouchs reçus', value: String(vouchsReceived(user.id).length), inline: true },
            { name: 'Vouchs donnés', value: String(vouchsGiven(user.id).length), inline: true },
            { name: 'Invitations', value: `${invites.real ?? 0} réelle(s), ${invites.fake ?? 0} suspecte(s), ${invites.leaves ?? 0} départ(s)`, inline: false },
            { name: 'Niveau', value: `${level.level} (${level.into}/100 XP)`, inline: true },
          ],
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Historique indisponible.', '/history');
    }
  },
};
