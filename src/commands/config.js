import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildConfigMainMenu } from '../systems/config/ConfigRenderer.js';
import { requireAdmin } from '../permissions.js';
import { safeError } from '../respond.js';
import { createConfigSession } from '../systems/config/ConfigSessions.js';

export default {
  category: 'Administration',
  description: 'Configuration unifiée du bot',
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Centre de configuration unifié du bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    try {
      const message = await interaction.reply({
        ...buildConfigMainMenu(),
        flags: MessageFlags.Ephemeral,
        fetchReply: true,
      });
      createConfigSession(message.id, interaction.user.id);
    } catch (err) {
      console.error(`[alln-utils] ouverture /config: ${err.stack ?? err.message}`);
      await safeError(interaction, 'Impossible d’ouvrir la configuration. Réessaie dans un instant.');
    }
  },
};
