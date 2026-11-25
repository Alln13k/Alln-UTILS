import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getConfig, setConfigValue } from '../config.js';
import { addAutomodWord, getWordlist, removeAutomodWord } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Modération',
  description: 'Configure l\'auto-modération',
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure l\'auto-modération')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('enable').setDescription('Active l\'automod'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Désactive l\'automod'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Récapitulatif de l\'automod'))
    .addSubcommandGroup((group) =>
      group
        .setName('set')
        .setDescription('Configure les seuils')
        .addSubcommand((sub) =>
          sub
            .setName('spam')
            .setDescription('Seuil de spam')
            .addIntegerOption((opt) => opt.setName('messages').setDescription('Messages max').setMinValue(2).setMaxValue(50).setRequired(true))
            .addIntegerOption((opt) => opt.setName('secondes').setDescription('Fenêtre en secondes').setMinValue(2).setMaxValue(300).setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub.setName('caps').setDescription('Seuil de majuscules').addIntegerOption((opt) => opt.setName('pourcent').setDescription('% max').setMinValue(10).setMaxValue(100).setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub.setName('mentions').setDescription('Seuil de mentions').addIntegerOption((opt) => opt.setName('nombre').setDescription('Mentions max').setMinValue(1).setMaxValue(50).setRequired(true)),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('wordlist')
        .setDescription('Gère la liste de mots interdits')
        .addSubcommand((sub) =>
          sub.setName('add').setDescription('Ajoute un mot').addStringOption((opt) => opt.setName('mot').setDescription('Mot').setMaxLength(80).setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub.setName('remove').setDescription('Retire un mot').addStringOption((opt) => opt.setName('mot').setDescription('Mot').setRequired(true)),
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('Liste les mots interdits')),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('immune')
        .setDescription('Gère les rôles immunisés')
        .addSubcommand((sub) =>
          sub.setName('add').setDescription('Ajoute un rôle immunisé').addRoleOption((opt) => opt.setName('role').setDescription('Rôle').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub.setName('remove').setDescription('Retire un rôle immunisé').addRoleOption((opt) => opt.setName('role').setDescription('Rôle').setRequired(true)),
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('Liste les rôles immunisés')),
    ),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand();
      const config = getConfig();

      if (!group && sub === 'enable') {
        setConfigValue('automodEnabled', true);
        return replyStatus(interaction, 'Automod **activé**.');
      }

      if (!group && sub === 'disable') {
        setConfigValue('automodEnabled', false);
        return replyStatus(interaction, 'Automod **désactivé**.');
      }

      if (!group && sub === 'status') return replyStatus(interaction);

      if (group === 'set' && sub === 'spam') {
        setConfigValue('automodSpamCount', interaction.options.getInteger('messages', true));
        setConfigValue('automodSpamWindow', interaction.options.getInteger('secondes', true));
        return replyStatus(interaction, 'Seuil de spam mis à jour.');
      }

      if (group === 'set' && sub === 'caps') {
        setConfigValue('automodCapsPercent', interaction.options.getInteger('pourcent', true));
        return replyStatus(interaction, 'Seuil de majuscules mis à jour.');
      }

      if (group === 'set' && sub === 'mentions') {
        setConfigValue('automodMentionsMax', interaction.options.getInteger('nombre', true));
        return replyStatus(interaction, 'Seuil de mentions mis à jour.');
      }

      if (group === 'wordlist' && sub === 'add') {
        addAutomodWord(interaction.options.getString('mot', true));
        return replyStatus(interaction, 'Mot ajouté à la wordlist.');
      }

      if (group === 'wordlist' && sub === 'remove') {
        removeAutomodWord(interaction.options.getString('mot', true));
        return replyStatus(interaction, 'Mot retiré de la wordlist.');
      }

      if (group === 'wordlist' && sub === 'list') {
        const words = getWordlist();
        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: `Wordlist — ${words.length}`,
            description: words.length ? words.map((word) => `• ${word}`).join('\n').slice(0, 4000) : 'Aucun mot interdit.',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (group === 'immune' && (sub === 'add' || sub === 'remove')) {
        const role = interaction.options.getRole('role', true);
        const list = new Set(config.automodImmuneRoles ?? []);
        if (sub === 'add') list.add(role.id);
        else list.delete(role.id);
        setConfigValue('automodImmuneRoles', [...list]);
        return replyStatus(interaction, `Rôle <@&${role.id}> ${sub === 'add' ? 'ajouté aux' : 'retiré des'} rôles immunisés.`);
      }

      if (group === 'immune' && sub === 'list') {
        const roles = config.automodImmuneRoles ?? [];
        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Rôles immunisés',
            description: roles.length ? roles.map((id) => `<@&${id}>`).join(', ') : 'Aucun rôle immunisé.',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return replyError(interaction, 'Sous-commande inconnue.');
    } catch (err) {
      return fail(interaction, err, 'Action automod impossible.', '/automod');
    }
  },
};

function replyStatus(interaction, extra = null) {
  const config = getConfig();
  const words = getWordlist();
  return interaction.reply({
    embeds: [buildEmbed({
      dark: true,
      title: 'Automod',
      description: extra,
      fields: [
        { name: 'Actif', value: config.automodEnabled ? '✅ oui' : '❌ non', inline: true },
        { name: 'Spam', value: `${config.automodSpamCount} msg / ${config.automodSpamWindow}s`, inline: true },
        { name: 'Majuscules', value: `> ${config.automodCapsPercent}%`, inline: true },
        { name: 'Mentions max', value: String(config.automodMentionsMax), inline: true },
        { name: 'Liens sous niveau', value: String(config.automodLinkMinLevel), inline: true },
        { name: 'Wordlist', value: `${words.length} mot(s)`, inline: true },
        {
          name: 'Rôles immunisés',
          value: (config.automodImmuneRoles ?? []).length ? config.automodImmuneRoles.map((id) => `<@&${id}>`).join(', ') : 'aucun',
          inline: false,
        },
      ],
    })],
    flags: MessageFlags.Ephemeral,
  });
}
