import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { averageNote, getStats, listPremium, listTickets, listTools, totalVouchs } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireStaff } from '../permissions.js';

export default {
  category: 'Utilitaires',
  description: 'Statistiques complètes du serveur',
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Statistiques complètes du serveur')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const stats = getStats();
      const tools = listTools();
      const tickets = listTickets();
      const open = tickets.filter((t) => t.status !== 'closed').length;
      const closed = tickets.filter((t) => t.status === 'closed').length;
      const activePremium = listPremium().filter((entry) => new Date(entry.expiresAt).getTime() > Date.now()).length;

      const byCategory = new Map();
      for (const tool of tools) {
        byCategory.set(tool.category, (byCategory.get(tool.category) ?? 0) + 1);
      }

      const top = tools
        .map((tool) => ({ name: tool.name, avg: averageNote(tool.slug) }))
        .filter((entry) => entry.avg !== null)
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 5);

      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: 'Alln UTILS — Statistiques',
          fields: [
            { name: 'Leaks publiés', value: String(stats.leaksPublished ?? 0), inline: true },
            { name: 'Tools', value: String(tools.length), inline: true },
            { name: 'Vouchs', value: String(totalVouchs()), inline: true },
            { name: 'Tickets ouverts', value: String(open), inline: true },
            { name: 'Tickets fermés', value: String(closed), inline: true },
            { name: 'Premiums actifs', value: String(activePremium), inline: true },
            {
              name: 'Tools par catégorie',
              value: byCategory.size
                ? [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, count]) => `${category} : ${count}`).join('\n')
                : 'aucune tool',
              inline: false,
            },
            {
              name: 'Top 5 tools',
              value: top.length
                ? top.map((entry, index) => `${index + 1}. **${entry.name}** — ${entry.avg}/5`).join('\n')
                : 'aucun vouch enregistré',
              inline: false,
            },
          ],
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Statistiques indisponibles.', '/stats');
    }
  },
};
