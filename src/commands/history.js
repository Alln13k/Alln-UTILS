import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { getNotes } from '../db.js';

export default {
  category: 'Utilitaire',
  description: 'Affiche l\'historique/notes d\'un utilisateur',
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Affiche les notes d\'un utilisateur')
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('utilisateur').setDescription('Utilisateur').setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser('utilisateur', true);
    const notes = getNotes(user.id);
    const description = notes.length
      ? notes.map((n) => `#${n.id} — ${n.note} (<@${n.moderatorId}>)`).join('\n')
      : 'Aucune note.';
    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: `Historique — <@${user.id}>`, description })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
