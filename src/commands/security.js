import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { requireAdmin } from '../permissions.js';
import { safeDefer, safeReply } from '../respond.js';
import { panic } from '../raidmode.js';
import { securityStatus } from '../services/security.js';
import { getConfig } from '../config.js';

export default {
  category: 'Sécurité',
  description: 'Gère la sécurité du serveur',
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Commandes de sécurité')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('panic').setDescription('Active le mode panique (verrouille les salons)'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Affiche l\'état de la sécurité')),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'panic') {
      if (!(await safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
      const changed = await panic(interaction.client, interaction.guild, { by: interaction.user.id });
      return safeReply(interaction, {
        embeds: [buildEmbed({
          dark: true,
          title: 'Panic',
          description: `Mode panique activé. ${changed} salon(s) verrouillé(s). Le propriétaire a été notifié.`,
        })],
      });
    }

    const status = securityStatus();
    const config = getConfig();
    return safeReply(interaction, {
      embeds: [buildEmbed({
        dark: true,
        title: 'Sécurité',
        fields: [
          { name: 'Raid mode', value: status.raidModeEnabled ? 'Actif' : 'Inactif', inline: true },
          { name: 'Piège à raid', value: config.raidTrapEnabled ? 'Actif' : 'Inactif', inline: true },
          { name: 'Salon piège', value: config.raidTrapChannelId ? `<#${config.raidTrapChannelId}>` : 'Non défini', inline: true },
          { name: 'Seuil joins', value: status.joinRate, inline: true },
          { name: 'Compte récent', value: `${status.newAccountDays} jour(s)`, inline: true },
          { name: 'Action raid', value: status.raidAction === 'ban' ? 'Ban' : 'Kick', inline: true },
          { name: 'Salons verrouillés', value: String(status.lockedChannels), inline: true },
        ],
      })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
