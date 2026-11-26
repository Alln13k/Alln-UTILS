import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { countActiveLogs, logCategories, logEventsFor, listLogOverrides } from '../logger.js';
import { requireAdmin } from '../permissions.js';
import { safeReply } from '../respond.js';
import { getConfig } from '../config.js';

export default {
  category: 'Configuration',
  description: 'Affiche l’état des logs ( lecture seule )',
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Affiche l’état de la journalisation')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('status').setDescription('Affiche l’état des logs'))
    .addSubcommand((sub) => sub.setName('events').setDescription('Liste les événements et leur état')),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const sub = interaction.options.getSubcommand();
    const config = getConfig();
    const { active, total } = countActiveLogs();

    if (sub === 'events') {
      const fields = logCategories().map((category) => {
        const events = logEventsFor(category) ?? {};
        const lines = Object.entries(events).map(([event, enabled]) =>
          `${enabled !== false ? '🟢' : '🔴'} \`${category}.${event}\``);
        return {
          name: category.slice(0, 256),
          value: lines.join('\n').slice(0, 1024) || 'Aucun événement',
          inline: false,
        };
      });
      return safeReply(interaction, {
        embeds: [buildEmbed({ dark: true, title: 'Événements de logs', fields })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const overrides = Object.keys(listLogOverrides()).length;
    return safeReply(interaction, {
      embeds: [buildEmbed({
        dark: true,
        title: 'État des logs',
        description: 'La configuration des logs se fait dans `/config` → catégorie Logs.',
        fields: [
          { name: 'Salon principal', value: config.logChannelId ? `<#${config.logChannelId}>` : 'Non défini', inline: true },
          { name: 'Salon tickets', value: config.ticketLogChannelId ? `<#${config.ticketLogChannelId}>` : 'Non défini', inline: true },
          { name: 'Salon transcripts', value: config.ticketTranscriptChannelId ? `<#${config.ticketTranscriptChannelId}>` : 'Non défini', inline: true },
          { name: 'Événements actifs', value: `${active}/${total}`, inline: true },
          { name: 'Overrides', value: String(overrides), inline: true },
        ],
      })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
