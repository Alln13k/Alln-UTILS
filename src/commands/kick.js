import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed, buildError } from '../embeds.js';
import { log } from '../logger.js';
import { requireStaff } from '../permissions.js';

export default {
  category: 'Modération',
  description: 'Expulse un membre',
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un membre du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('utilisateur').setDescription('Utilisateur à expulser').setRequired(true))
    .addStringOption((opt) => opt.setName('raison').setDescription('Raison du kick').setRequired(false)),

  async execute(interaction) {
    if (!(await requireStaff(interaction))) return;
    const user = interaction.options.getUser('utilisateur', true);
    const raison = interaction.options.getString('raison') ?? 'Aucune raison';
    const member = interaction.guild.members.cache.get(user.id) ?? await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ embeds: [buildError('Membre introuvable.')], flags: MessageFlags.Ephemeral });
    await member.kick(raison);

    await log(interaction.client, 'moderation', 'kick', {
      guild: interaction.guild,
      fields: [
        { name: 'Utilisateur', value: `<@${user.id}>`, inline: true },
        { name: 'Raison', value: raison, inline: false },
        { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Kick', description: `<@${user.id}> a été expulsé.` })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
