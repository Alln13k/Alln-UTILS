import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { resetStore } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireAdmin, replyError } from '../permissions.js';

export default {
  category: 'Administration',
  description: 'Supprime définitivement des données',
  data: new SlashCommandBuilder()
    .setName('wipe')
    .setDescription('Supprime définitivement des données')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption((opt) =>
      opt
        .setName('confirmation')
        .setDescription('Écris CONFIRM pour valider')
        .setRequired(true)
        .setMaxLength(16),
    )
    .addStringOption((opt) =>
      opt
        .setName('cible')
        .setDescription('Données à supprimer')
        .setRequired(true)
        .addChoices(
          { name: 'leaks', value: 'leaks' },
          { name: 'tools', value: 'tools' },
          { name: 'vouchs', value: 'vouchs' },
          { name: 'tickets', value: 'tickets' },
          { name: 'tout', value: 'tout' },
        ),
    ),

  async execute(interaction) {
    try {
      if (!(await requireAdmin(interaction))) return;

      const confirmation = interaction.options.getString('confirmation', true).trim();
      const target = interaction.options.getString('cible', true);

      if (confirmation !== 'CONFIRM') {
        return replyError(interaction, 'Confirmation invalide. Écris exactement `CONFIRM`.');
      }

      const done = [];
      if (target === 'tout') {
        done.push(resetStore('leaks'));
        done.push(resetStore('tools'));
        done.push(resetStore('tickets'));
      } else {
        done.push(resetStore(target));
      }

      await log(interaction.client, 'admin', 'wipe', {
        guild: interaction.guild,
        fields: [
          { name: 'Cible', value: target, inline: true },
          { name: 'Effectué', value: done.join(', '), inline: false },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: 'Wipe effectué',
          description: `Données supprimées : **${done.join(', ')}**.\nCette action est irréversible.`,
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Wipe impossible.', '/wipe');
    }
  },
};
