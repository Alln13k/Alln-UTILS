import {
  ActionRowBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { fail } from '../permissions.js';

export function buildHelpCategories(client) {
  const commands = [...client.commands.values()];
  return [...new Set(commands.map((cmd) => cmd.category ?? 'Autres'))].sort();
}

export function buildHelpPanel(client) {
  const commands = [...client.commands.values()];
  const categories = buildHelpCategories(client);

  const description = [
    'Sélectionne une catégorie pour afficher le détail des commandes disponibles.',
    '',
    ...categories.map((category) => `• **${category}** — ${commands.filter((cmd) => (cmd.category ?? 'Autres') === category).length} commande(s)`),
  ].join('\n').slice(0, 4000);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('help_panel_select')
    .setPlaceholder('Choisis une catégorie')
    .addOptions(categories.slice(0, 25).map((category) => ({
      label: category.slice(0, 100),
      value: category,
      description: `${commands.filter((cmd) => (cmd.category ?? 'Autres') === category).length} commande(s)`,
    })));

  return {
    embeds: [buildEmbed({
      dark: true,
      title: 'Alln UTILS — Panneau d\'aide',
      description,
    })],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

export function buildHelpCategoryEmbed(client, category) {
  const commands = [...client.commands.values()].filter((cmd) => (cmd.category ?? 'Autres') === category);
  const fields = commands.slice(0, 25).map((cmd) => ({
    name: `/${cmd.data.name}`,
    value: String(cmd.description ?? 'Sans description').slice(0, 400),
    inline: false,
  }));

  return buildEmbed({
    dark: true,
    title: `Alln UTILS — ${category}`,
    description: commands.length ? `${commands.length} commande(s) dans cette catégorie.` : 'Aucune commande dans cette catégorie.',
    fields,
  });
}

export default {
  category: 'Utilitaires',
  description: 'Panneau d\'aide interactif',
  data: new SlashCommandBuilder()
    .setName('help_panel')
    .setDescription('Panneau d\'aide interactif')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      return interaction.reply({ ...buildHelpPanel(interaction.client), flags: MessageFlags.Ephemeral });
    } catch (err) {
      return fail(interaction, err, 'Affichage du panneau d\'aide impossible.', '/help_panel');
    }
  },
};
