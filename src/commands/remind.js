import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { listReminders, nextReminderId, saveReminder } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { parseDuration } from '../duration.js';
import { fail, replyError } from '../permissions.js';
import { addReminder, removeReminder } from '../services/reminders.js';

export default {
  category: 'Utilitaires',
  description: 'Rappels personnels',
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Rappels personnels')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Crée un rappel')
        .addStringOption((opt) => opt.setName('duree').setDescription('Durée : 10m, 2h, 1d').setRequired(true))
        .addStringOption((opt) => opt.setName('texte').setDescription('Rappel').setMaxLength(1000).setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste tes rappels'))
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Supprime un rappel').addIntegerOption((opt) => opt.setName('id').setDescription('ID').setRequired(true)),
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const raw = interaction.options.getString('duree', true);
        const ms = parseDuration(raw);
        if (!ms) return replyError(interaction, 'Durée invalide. Exemples : `10m`, `2h`, `1d`.');

        const reminder = {
          id: nextReminderId(),
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          channelId: interaction.channelId,
          text: interaction.options.getString('texte', true),
          dueAt: new Date(Date.now() + ms).toISOString(),
          createdAt: new Date().toISOString(),
        };
        saveReminder(reminder);
        addReminder(interaction.client, reminder);

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Rappel programmé',
            description: `Je te DM <t:${Math.floor(new Date(reminder.dueAt).getTime() / 1000)}:R>.`,
            fields: [{ name: 'Rappel', value: reminder.text.slice(0, 1000) }],
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'list') {
        const reminders = listReminders(interaction.user.id).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
        const description = reminders.length
          ? reminders.map((reminder) => `**#${reminder.id}** — <t:${Math.floor(new Date(reminder.dueAt).getTime() / 1000)}:R> — ${reminder.text.slice(0, 100)}`).join('\n')
          : 'Aucun rappel.';
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Tes rappels — ${reminders.length}`, description })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'remove') {
        const id = interaction.options.getInteger('id', true);
        const reminder = listReminders(interaction.user.id).find((entry) => entry.id === id);
        if (!reminder) return replyError(interaction, 'Rappel introuvable ou ne t\'appartient pas.');
        removeReminder(id);
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Rappel supprimé', description: `Le rappel #${id} a été supprimé.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action rappel impossible.', '/remind');
    }
  },
};
