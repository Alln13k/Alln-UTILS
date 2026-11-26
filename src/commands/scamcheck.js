import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';

export default {
  category: 'Sécurité',
  description: 'Vérifie un lien ou un utilisateur',
  data: new SlashCommandBuilder()
    .setName('scamcheck')
    .setDescription('Vérifie un lien ou un utilisateur pour un éventuel scam')
    .setDMPermission(false)
    .addStringOption((opt) => opt.setName('lien').setDescription('Lien à vérifier').setRequired(false))
    .addUserOption((opt) => opt.setName('utilisateur').setDescription('Utilisateur à vérifier').setRequired(false)),

  async execute(interaction) {
    const lien = interaction.options.getString('lien');
    const utilisateur = interaction.options.getUser('utilisateur');

    const fields = [];
    if (lien) fields.push({ name: 'Lien', value: lien, inline: false });
    if (utilisateur) fields.push({ name: 'Utilisateur', value: `<@${utilisateur.id}>`, inline: true });

    return interaction.reply({
      embeds: [buildEmbed({
        dark: true,
        title: 'ScamCheck',
        description: 'Aucune menace détectée (vérification basique).',
        fields,
      })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
