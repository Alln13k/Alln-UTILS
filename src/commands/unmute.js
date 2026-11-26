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
  description: 'Retire le mute d\'un membre',
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Retire le timeout d\'un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('utilisateur').setDescription('Utilisateur à unmute').setRequired(true)),

  async execute(interaction) {
    if (!(await requireStaff(interaction))) return;
    const user = interaction.options.getUser('utilisateur', true);
    const member = interaction.guild.members.cache.get(user.id) ?? await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ embeds: [buildError('Membre introuvable.')], flags: MessageFlags.Ephemeral });
    await member.timeout(null).catch(() => null);

    await log(interaction.client, 'moderation', 'unmute', {
      guild: interaction.guild,
      fields: [
        { name: 'Utilisateur', value: `<@${user.id}>`, inline: true },
        { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Unmute', description: `<@${user.id}> n\'est plus muet.` })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
