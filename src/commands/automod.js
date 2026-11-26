import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { requireAdmin } from '../permissions.js';
import { getConfig } from '../config.js';

export default {
  category: 'Modération',
  description: 'Affiche les paramètres automod',
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Affiche les paramètres de l\'auto-modération')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const config = getConfig();
    const settings = config.automodSettings ?? {};

    const fields = [
      { name: 'Spam', value: `Count: ${settings.spam?.count ?? 5}, Window: ${settings.spam?.window ?? 10}s`, inline: true },
      { name: 'Caps', value: `${settings.caps?.percent ?? 70}% min ${settings.caps?.minLength ?? 10} car`, inline: true },
      { name: 'Mentions', value: `Max: ${settings.mentions?.max ?? 5}`, inline: true },
      { name: 'Liens', value: `Niveau min: ${settings.links?.minLevel ?? 5}`, inline: true },
      { name: 'Invitations', value: settings.invites?.enabled ? 'Actif' : 'Inactif', inline: true },
      { name: 'Wordlist', value: settings.wordlist?.enabled ? 'Actif' : 'Inactif', inline: true },
    ];

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Auto-modération', fields })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
