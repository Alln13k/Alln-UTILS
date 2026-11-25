import {
  ActionRowBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { fail } from '../permissions.js';

export default {
  category: 'Utilitaires',
  description: 'Liste toutes les commandes disponibles',
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Liste toutes les commandes disponibles')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const commands = [...interaction.client.commands.values()];
      const categories = [...new Set(commands.map((cmd) => cmd.category ?? 'Autres'))].sort();

      const description = categories
        .map((category) => {
          const lines = commands
            .filter((cmd) => (cmd.category ?? 'Autres') === category)
            .map((cmd) => `**/${cmd.data.name}** — ${cmd.description ?? 'Sans description'}`);
          return `__${category}__\n${lines.join('\n')}`;
        })
        .join('\n\n');

      const menu = new StringSelectMenuBuilder()
        .setCustomId('help_select')
        .setPlaceholder('Filtrer par catégorie')
        .addOptions(
          categories.slice(0, 25).map((category) => ({
            label: category,
            value: category,
            description: `${commands.filter((cmd) => (cmd.category ?? 'Autres') === category).length} commande(s)`,
          })),
        );

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Alln UTILS — Commandes', description })],
        components: [new ActionRowBuilder().addComponents(menu)],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Affichage de l\'aide impossible.', '/help');
    }
  },
};
