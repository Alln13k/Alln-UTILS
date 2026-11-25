import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { addCustomCommand, listCustomCommands, removeCustomCommand } from '../db.js';
import { getConfig } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Utilitaires',
  description: 'Commandes personnalisées par préfixe',
  data: new SlashCommandBuilder()
    .setName('customcmd')
    .setDescription('Commandes personnalisées par préfixe')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Crée une commande')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nom (sans le préfixe)').setMaxLength(40).setRequired(true))
        .addStringOption((opt) => opt.setName('reponse').setDescription('Réponse — variables {user}, {mention}, {server}, {membercount}').setMaxLength(1500).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Supprime une commande').addStringOption((opt) => opt.setName('nom').setDescription('Nom').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les commandes')),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;
      const sub = interaction.options.getSubcommand();
      const config = getConfig();

      if (sub === 'add') {
        const name = interaction.options.getString('nom', true);
        const response = interaction.options.getString('reponse', true);
        const command = addCustomCommand(name, response, interaction.user.id);
        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Commande créée',
            description: `Utilise \`${config.customCommandPrefix}${command.name}\` pour déclencher la réponse.`,
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'remove') {
        const name = interaction.options.getString('nom', true);
        removeCustomCommand(name);
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Commande supprimée', description: `\`${name}\` a été retirée.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'list') {
        const commands = listCustomCommands();
        const description = commands.length
          ? commands.map((command) => `**${config.customCommandPrefix}${command.name}** — ${command.response.slice(0, 100)}`).join('\n').slice(0, 4000)
          : 'Aucune commande personnalisée.';
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Commandes personnalisées — ${commands.length}`, description, fields: [{ name: 'Préfixe', value: `\`${config.customCommandPrefix}\``, inline: true }] })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return replyError(interaction, 'Sous-commande inconnue.');
    } catch (err) {
      return fail(interaction, err, 'Action commande personnalisée impossible.', '/customcmd');
    }
  },
};
