import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { addBlacklist, isBlacklisted, listBlacklist, removeBlacklist } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Administration',
  description: 'Gère la blacklist du bot',
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Gère la blacklist du bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Blacklist un utilisateur')
        .addUserOption((opt) => opt.setName('membre').setDescription('Utilisateur').setRequired(true))
        .addStringOption((opt) => opt.setName('raison').setDescription('Raison').setMaxLength(400).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Retire un utilisateur de la blacklist')
        .addUserOption((opt) => opt.setName('membre').setDescription('Utilisateur').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste la blacklist')),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const user = interaction.options.getUser('membre', true);
        const reason = interaction.options.getString('raison', true);

        if (user.id === interaction.user.id) return replyError(interaction, 'Tu ne peux pas te blacklist toi-même.');
        if (isBlacklisted(user.id)) return replyError(interaction, 'Cet utilisateur est déjà blacklisté.');

        addBlacklist(user.id, reason, interaction.user.id);

        await log(interaction.client, 'moderation', 'blacklistAdd', {
          guild: interaction.guild,
          fields: [
            { name: 'Utilisateur', value: `<@${user.id}> (${user.tag})`, inline: true },
            { name: 'ID', value: user.id, inline: true },
            { name: 'Raison', value: reason.slice(0, 1000), inline: false },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Blacklist', description: `<@${user.id}> a été blacklisté du bot.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'remove') {
        const user = interaction.options.getUser('membre', true);
        removeBlacklist(user.id);

        await log(interaction.client, 'moderation', 'blacklistRemove', {
          guild: interaction.guild,
          fields: [
            { name: 'Utilisateur', value: `<@${user.id}> (${user.tag})`, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Blacklist', description: `<@${user.id}> a été retiré de la blacklist.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'list') {
        const entries = listBlacklist();
        const description = entries.length
          ? entries.map((e) => `<@${e.userId}> — ${e.reason || 'sans raison'} (<t:${Math.floor(new Date(e.createdAt).getTime() / 1000)}:d>)`).join('\n').slice(0, 4000)
          : 'Blacklist vide.';

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Blacklist — ${entries.length}`, description })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action blacklist impossible.', '/blacklist');
    }
  },
};
