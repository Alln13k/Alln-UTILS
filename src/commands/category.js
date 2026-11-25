import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { addCategory, listCategories, removeCategory } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff } from '../permissions.js';

export default {
  category: 'Tools',
  description: 'Gère les catégories de tools',
  data: new SlashCommandBuilder()
    .setName('category')
    .setDescription('Gère les catégories de tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Ajoute une catégorie')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nom').setMaxLength(30).setRequired(true))
        .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji').setMaxLength(8).setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Supprime une catégorie')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nom').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les catégories')),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'list') return listCommand(interaction);
      if (!(await requireStaff(interaction))) return;

      if (sub === 'add') {
        const name = interaction.options.getString('nom', true);
        const emoji = interaction.options.getString('emoji') ?? '📦';
        const category = addCategory(name, emoji);

        await log(interaction.client, 'tools', 'add', {
          guild: interaction.guild,
          title: 'Catégorie ajoutée',
          fields: [
            { name: 'Nom', value: `${category.emoji} ${category.name}`, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Catégorie ajoutée', description: `${category.emoji} **${category.name}**` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'remove') {
        const name = interaction.options.getString('nom', true);
        removeCategory(name);

        await log(interaction.client, 'tools', 'remove', {
          guild: interaction.guild,
          title: 'Catégorie supprimée',
          fields: [
            { name: 'Nom', value: name, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Catégorie supprimée', description: `**${name}** a été retirée.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action catégorie impossible.', '/category');
    }
  },
};

function listCommand(interaction) {
  const categories = listCategories();
  const description = categories.length
    ? categories.map((c) => `${c.emoji} **${c.name}**${c.builtin ? ' _(par défaut)_' : ''}`).join('\n')
    : 'Aucune catégorie.';

  return interaction.reply({
    embeds: [buildEmbed({ dark: true, title: `Catégories — ${categories.length}`, description })],
    flags: MessageFlags.Ephemeral,
  });
}
