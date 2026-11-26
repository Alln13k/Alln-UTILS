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
  description: 'Supprime des messages',
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprime des messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addIntegerOption((opt) => opt.setName('nombre').setDescription('Nombre de messages').setRequired(true).setMinValue(1).setMaxValue(100)),

  async execute(interaction) {
    if (!(await requireStaff(interaction))) return;
    const nombre = interaction.options.getInteger('nombre', true);
    const deleted = await interaction.channel.bulkDelete(nombre, true).catch(() => null);
    const count = deleted ? deleted.size : 0;

    await log(interaction.client, 'moderation', 'clear', {
      guild: interaction.guild,
      fields: [
        { name: 'Salon', value: `<#${interaction.channelId}>`, inline: true },
        { name: 'Messages', value: String(count), inline: true },
        { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Clear', description: `${count} message(s) supprimé(s).` })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
