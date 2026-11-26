import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed, buildError } from '../embeds.js';
import { log } from '../logger.js';
import { requireStaff } from '../permissions.js';
import { isBlacklisted, addBlacklist, removeBlacklist, getBlacklist } from '../db.js';

export default {
  category: 'Modération',
  description: 'Gère la blacklist',
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Gère la blacklist du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Ajoute un utilisateur à la blacklist')
        .addUserOption((opt) => opt.setName('utilisateur').setDescription('Utilisateur').setRequired(true))
        .addStringOption((opt) => opt.setName('raison').setDescription('Raison').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Retire un utilisateur de la blacklist')
        .addUserOption((opt) => opt.setName('utilisateur').setDescription('Utilisateur').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste la blacklist')),

  async execute(interaction) {
    if (!(await requireStaff(interaction))) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const user = interaction.options.getUser('utilisateur', true);
      const raison = interaction.options.getString('raison', true);
      addBlacklist(user.id, raison, interaction.user.id);
      await log(interaction.client, 'moderation', 'blacklistAdd', {
        guild: interaction.guild,
        fields: [
          { name: 'Utilisateur', value: `<@${user.id}>`, inline: true },
          { name: 'Raison', value: raison, inline: false },
          { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });
      return interaction.reply({ embeds: [buildEmbed({ dark: true, title: 'Blacklist', description: `<@${user.id}> ajouté à la blacklist.` })], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'remove') {
      const user = interaction.options.getUser('utilisateur', true);
      removeBlacklist(user.id);
      await log(interaction.client, 'moderation', 'blacklistRemove', {
        guild: interaction.guild,
        fields: [
          { name: 'Utilisateur', value: `<@${user.id}>`, inline: true },
          { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });
      return interaction.reply({ embeds: [buildEmbed({ dark: true, title: 'Blacklist', description: `<@${user.id}> retiré de la blacklist.` })], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'list') {
      const bl = getBlacklist();
      const entries = Object.values(bl);
      const description = entries.length
        ? entries.map((e) => `<@${e.userId}> — ${e.reason}`).join('\n')
        : 'Aucun utilisateur blacklisté.';
      return interaction.reply({ embeds: [buildEmbed({ dark: true, title: 'Blacklist', description })], flags: MessageFlags.Ephemeral });
    }
  },
};
