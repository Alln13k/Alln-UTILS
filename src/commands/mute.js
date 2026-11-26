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
  description: 'Rend muet un membre',
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Rend muet un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('utilisateur').setDescription('Utilisateur à rendre muet').setRequired(true))
    .addIntegerOption((opt) => opt.setName('duree').setDescription('Durée en minutes').setRequired(false))
    .addStringOption((opt) => opt.setName('raison').setDescription('Raison du mute').setRequired(false)),

  async execute(interaction) {
    if (!(await requireStaff(interaction))) return;
    const user = interaction.options.getUser('utilisateur', true);
    const duree = interaction.options.getInteger('duree');
    const raison = interaction.options.getString('raison') ?? 'Aucune raison';
    const member = interaction.guild.members.cache.get(user.id) ?? await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ embeds: [buildError('Membre introuvable.')], flags: MessageFlags.Ephemeral });

    const until = duree ? new Date(Date.now() + duree * 60000) : null;
    await member.timeout(until, raison).catch(() => null);

    await log(interaction.client, 'moderation', 'mute', {
      guild: interaction.guild,
      fields: [
        { name: 'Utilisateur', value: `<@${user.id}>`, inline: true },
        { name: 'Durée', value: duree ? `${duree} min` : 'Permanent', inline: true },
        { name: 'Raison', value: raison, inline: false },
        { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Mute', description: `<@${user.id}> a été rendu muet.` })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
