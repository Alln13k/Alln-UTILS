import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { buildHelpPanel } from '../helpUi.js';

export default {
  category: 'Utilitaire',
  description: 'Affiche le panneau d\'aide interactif',
  data: new SlashCommandBuilder()
    .setName('help_panel')
    .setDescription('Affiche le panneau d\'aide')
    .setDMPermission(false),

  async execute(interaction) {
    return interaction.reply({
      ...buildHelpPanel(),
      flags: MessageFlags.Ephemeral,
    });
  },
};
