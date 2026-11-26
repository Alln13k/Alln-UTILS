import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';

export default {
  category: 'Utilitaire',
  description: 'Crée un sondage simple',
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Crée un sondage simple')
    .setDMPermission(false)
    .addStringOption((opt) => opt.setName('question').setDescription('Question du sondage').setRequired(true))
    .addStringOption((opt) => opt.setName('choix1').setDescription('Choix 1').setRequired(true))
    .addStringOption((opt) => opt.setName('choix2').setDescription('Choix 2').setRequired(true)),

  async execute(interaction) {
    const question = interaction.options.getString('question', true);
    const choix1 = interaction.options.getString('choix1', true);
    const choix2 = interaction.options.getString('choix2', true);

    const msg = await interaction.reply({
      embeds: [buildEmbed({
        dark: true,
        title: 'Sondage',
        description: question,
        fields: [
          { name: '1️⃣', value: choix1, inline: true },
          { name: '2️⃣', value: choix2, inline: true },
        ],
      })],
      fetchReply: true,
    });

    await msg.react('1️⃣');
    await msg.react('2️⃣');
  },
};
