import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getBumps, setBumpReminder } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail } from '../permissions.js';
import { bumpLeaderboard, scheduleReminder } from '../services/bumps.js';

export default {
  category: 'Engagement',
  description: 'Bumps et rappels',
  data: new SlashCommandBuilder()
    .setName('bump')
    .setDescription('Bumps et rappels')
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('remind').setDescription('Programme un rappel de bump dans 2 heures'))
    .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Classement des bumpers')),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'remind') {
        const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        setBumpReminder(dueAt);
        scheduleReminder(interaction.client);
        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Rappel de bump programmé',
            description: `Rappel prévu <t:${Math.floor(new Date(dueAt).getTime() / 1000)}:R> dans <#${interaction.channelId}>.`,
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'leaderboard') {
        const top = bumpLeaderboard(10);
        const description = top.length
          ? top.map((entry, index) => `**${index + 1}.** <@${entry.userId}> — ${entry.count} bump(s)`).join('\n')
          : 'Aucun bump enregistré.';
        const state = getBumps();
        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Classement des bumps',
            description,
            fields: state.nextReminderAt
              ? [{ name: 'Prochain rappel', value: `<t:${Math.floor(new Date(state.nextReminderAt).getTime() / 1000)}:R>`, inline: true }]
              : [],
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action bump impossible.', '/bump');
    }
  },
};
