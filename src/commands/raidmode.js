import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { requireAdmin } from '../permissions.js';
import { safeDefer, safeReply } from '../respond.js';
import { disableRaidMode, enableRaidMode } from '../raidmode.js';

export default {
  category: 'Sécurité',
  description: 'Active/désactive le raid mode',
  data: new SlashCommandBuilder()
    .setName('raidmode')
    .setDescription('Active ou désactive le raid mode')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addBooleanOption((opt) => opt.setName('actif').setDescription('État du raid mode').setRequired(true)),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const actif = interaction.options.getBoolean('actif', true);

    if (!(await safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;

    const changed = actif
      ? await enableRaidMode(interaction.client, interaction.guild, { by: interaction.user.id })
      : await disableRaidMode(interaction.client, interaction.guild, { by: interaction.user.id });

    return safeReply(interaction, {
      embeds: [buildEmbed({
        dark: true,
        title: 'Raid mode',
        description: `Raid mode ${actif ? 'activé' : 'désactivé'}. ${changed} salon(s) ${actif ? 'verrouillé(s)' : 'restauré(s)'}.`,
      })],
    });
  },
};
