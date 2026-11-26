import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';

export default {
  category: 'Utilitaire',
  description: 'Affiche les statistiques du serveur',
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Affiche les statistiques du serveur')
    .setDMPermission(false),

  async execute(interaction) {
    const guild = interaction.guild;
    const members = guild.members.cache;
    const humans = members.filter((m) => !m.user.bot).size;
    const bots = members.filter((m) => m.user.bot).size;
    const online = members.filter((m) => m.presence?.status === 'online').size;
    const idle = members.filter((m) => m.presence?.status === 'idle').size;
    const dnd = members.filter((m) => m.presence?.status === 'dnd').size;

    return interaction.reply({
      embeds: [buildEmbed({
        dark: true,
        title: `Statistiques — ${guild.name}`,
        fields: [
          { name: 'Membres', value: String(guild.memberCount), inline: true },
          { name: 'Humains', value: String(humans), inline: true },
          { name: 'Bots', value: String(bots), inline: true },
          { name: 'En ligne', value: String(online), inline: true },
          { name: 'Inactifs', value: String(idle), inline: true },
          { name: 'Ne pas déranger', value: String(dnd), inline: true },
          { name: 'Salons', value: String(guild.channels.cache.size), inline: true },
          { name: 'Rôles', value: String(guild.roles.cache.size), inline: true },
        ],
      })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
