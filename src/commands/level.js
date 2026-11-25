import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getLevelUser } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail } from '../permissions.js';
import { levelProgress } from '../services/levels.js';

export default {
  category: 'Niveaux',
  description: 'Affiche le niveau d\'un membre',
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Affiche le niveau d\'un membre')
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('membre').setDescription('Membre (défaut : toi)').setRequired(false)),

  async execute(interaction) {
    try {
      const user = interaction.options.getUser('membre') ?? interaction.user;
      const data = getLevelUser(user.id);
      const progress = levelProgress(data.xp);

      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: `Niveau — ${user.tag}`,
          description: `\`${progress.bar}\` **${progress.percent}%**`,
          thumbnail: user.displayAvatarURL({ size: 128 }),
          fields: [
            { name: 'Niveau', value: String(progress.level), inline: true },
            { name: 'XP total', value: String(data.xp), inline: true },
            { name: 'Progression', value: `${progress.into}/100 XP`, inline: true },
            { name: 'Reste', value: `${progress.needed} XP avant le niveau ${progress.level + 1}`, inline: false },
          ],
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Niveau indisponible.', '/level');
    }
  },
};
