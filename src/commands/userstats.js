import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  countOpenTicketsFor,
  countWarns,
  getLevelUser,
  getUserStats,
  listUserMessages,
  listUserVoice,
  vouchsReceived,
} from '../db.js';
import { formatDuration } from '../duration.js';
import { buildEmbed } from '../embeds.js';
import { fail } from '../permissions.js';
import { levelFromXp } from '../services/levels.js';

function formatVoice(ms) {
  return ms > 0 ? formatDuration(ms) : 'aucune';
}

export default {
  category: 'Utilitaires',
  description: 'Statistiques détaillées d\'un membre',
  data: new SlashCommandBuilder()
    .setName('userstats')
    .setDescription('Statistiques détaillées d\'un membre')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('user')
        .setDescription('Fiche d\'un membre')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre (défaut : toi)').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('top')
        .setDescription('Classements')
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Classement')
            .setRequired(true)
            .addChoices(
              { name: 'Messages', value: 'messages' },
              { name: 'Vocal', value: 'vocal' },
            ),
        ),
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'top') {
        const type = interaction.options.getString('type', true);
        const rows = type === 'messages'
          ? listUserMessages().sort((a, b) => b.count - a.count).slice(0, 10).map((entry) => `<@${entry.userId}> — ${entry.count} message(s)`)
          : listUserVoice().sort((a, b) => b.ms - a.ms).slice(0, 10).map((entry) => `<@${entry.userId}> — ${formatVoice(entry.ms)}`);

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: type === 'messages' ? 'Top messages' : 'Top vocal',
            description: rows.length ? rows.map((line, index) => `**${index + 1}.** ${line}`).join('\n') : 'Aucune donnée.',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      const user = interaction.options.getUser('membre') ?? interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const stats = getUserStats(user.id);
      const level = levelFromXp(getLevelUser(user.id).xp);

      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: `Statistiques — ${user.tag}`,
          thumbnail: user.displayAvatarURL({ size: 256 }),
          fields: [
            { name: 'Messages envoyés', value: String(stats.messages), inline: true },
            { name: 'Temps vocal', value: formatVoice(stats.voiceMs), inline: true },
            { name: 'Tickets ouverts', value: String(countOpenTicketsFor(user.id)), inline: true },
            { name: 'Warns', value: String(countWarns(user.id)), inline: true },
            { name: 'Vouchs reçus', value: String(vouchsReceived(user.id).length), inline: true },
            { name: 'Niveau', value: String(level), inline: true },
            {
              name: 'Arrivée',
              value: member?.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>` : 'inconnue',
              inline: false,
            },
          ],
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Statistiques utilisateur indisponibles.', '/userstats');
    }
  },
};
