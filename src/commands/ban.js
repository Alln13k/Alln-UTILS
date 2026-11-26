import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { requireStaff } from '../permissions.js';

export default {
  category: 'Modération',
  description: 'Bannit un membre',
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un membre du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('utilisateur').setDescription('Utilisateur à bannir').setRequired(true))
    .addStringOption((opt) => opt.setName('raison').setDescription('Raison du ban').setRequired(false)),

  async execute(interaction) {
    if (!(await requireStaff(interaction))) return;
    const user = interaction.options.getUser('utilisateur', true);
    const raison = interaction.options.getString('raison') ?? 'Aucune raison';
    await interaction.guild.members.ban(user, { reason: raison }).catch(() => null);

    await log(interaction.client, 'moderation', 'ban', {
      guild: interaction.guild,
      fields: [
        { name: 'Utilisateur', value: `<@${user.id}>`, inline: true },
        { name: 'Raison', value: raison, inline: false },
        { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Ban', description: `<@${user.id}> a été banni.` })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
