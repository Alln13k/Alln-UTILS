import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  CONFIG_KEYS,
  configKeyList,
  describeConfigKey,
  getConfig,
  resetConfigValue,
  setConfigValue,
} from '../config.js';
import { displayConfigValue, parseValue } from '../configParse.js';
import { buildConfigPage, buildLogsMenu } from '../configUi.js';
import { buildEmbed, buildError } from '../embeds.js';
import { log } from '../logger.js';
import { requireAdmin } from '../permissions.js';
import { startWizard } from '../configWizard.js';

export default {
  category: 'Administration',
  description: 'Configuration complète du bot',
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configuration complète du bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('wizard').setDescription('Assistant universel : parcourt toutes les clés avec Passer'))
    .addSubcommand((sub) => sub.setName('show').setDescription('Affiche toute la configuration'))
    .addSubcommand((sub) => sub.setName('logs').setDescription('Ouvre le menu des logs par événement'))
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Modifie une clé de configuration')
        .addStringOption((opt) => opt.setName('cle').setDescription('Clé (voir /config keys)').setRequired(true))
        .addStringOption((opt) => opt.setName('valeur').setDescription('Valeur (mention, id, texte, true/false, liste séparée par virgules)').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Remet une clé à sa valeur par défaut')
        .addStringOption((opt) => opt.setName('cle').setDescription('Clé').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('keys').setDescription('Liste les clés disponibles'))
    .addSubcommandGroup((group) =>
      group
        .setName('ticketforms')
        .setDescription('Gère les questions des formulaires de tickets')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Définit les questions d\'une catégorie')
            .addStringOption((opt) => opt.setName('categorie').setDescription('Catégorie de ticket').setMaxLength(40).setRequired(true))
            .addStringOption((opt) => opt.setName('questions').setDescription('Questions séparées par | (5 max)').setMaxLength(900).setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Supprime le formulaire d\'une catégorie')
            .addStringOption((opt) => opt.setName('categorie').setDescription('Catégorie de ticket').setMaxLength(40).setRequired(true)),
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('Liste les formulaires')),
    ),

  async execute(interaction) {
    try {
      if (!(await requireAdmin(interaction))) return;
      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand();

      if (group === 'ticketforms') {
        const forms = { ...(getConfig().ticketForms ?? {}) };
        const category = interaction.options.getString('categorie')?.trim().toLowerCase();

        if (sub === 'list') {
          const entries = Object.entries(forms);
          const fields = entries.length
            ? entries.slice(0, 25).map(([name, questions]) => ({
              name,
              value: questions.map((question, index) => `${index + 1}. ${question}`).join('\n').slice(0, 1000),
              inline: false,
            }))
            : [];
          return interaction.reply({
            embeds: [buildEmbed({
              dark: true,
              title: 'Formulaires de tickets',
              description: entries.length ? null : 'Aucun formulaire configuré.',
              fields,
            })],
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!category) return interaction.reply({ embeds: [buildError('Catégorie requise.')], flags: MessageFlags.Ephemeral });

        if (sub === 'add') {
          const questions = interaction.options.getString('questions', true)
            .split('|')
            .map((question) => question.trim())
            .filter(Boolean)
            .slice(0, 5);
          if (questions.length === 0) return interaction.reply({ embeds: [buildError('Aucune question valide.')], flags: MessageFlags.Ephemeral });
          forms[category] = questions;
          setConfigValue('ticketForms', forms);
          await log(interaction.client, 'config', 'changed', {
            guild: interaction.guild,
            title: 'Formulaire ticket ajouté',
            fields: [
              { name: 'Catégorie', value: category, inline: true },
              { name: 'Questions', value: questions.join(' | ').slice(0, 800), inline: false },
              { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
            ],
          });
          return interaction.reply({
            embeds: [buildEmbed({ dark: true, title: 'Formulaire enregistré', description: `**${category}** — ${questions.length} question(s).` })],
            flags: MessageFlags.Ephemeral,
          });
        }

        if (sub === 'remove') {
          if (!forms[category]) return interaction.reply({ embeds: [buildError('Formulaire introuvable.')], flags: MessageFlags.Ephemeral });
          delete forms[category];
          setConfigValue('ticketForms', forms);
          await log(interaction.client, 'config', 'changed', {
            guild: interaction.guild,
            title: 'Formulaire ticket supprimé',
            fields: [
              { name: 'Catégorie', value: category, inline: true },
              { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
            ],
          });
          return interaction.reply({
            embeds: [buildEmbed({ dark: true, title: 'Formulaire supprimé', description: `Formulaire \`${category}\` supprimé.` })],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      if (sub === 'wizard') {
        return startWizard(interaction);
      }

      if (sub === 'show') {
        return interaction.reply({ ...buildConfigPage(0), flags: MessageFlags.Ephemeral });
      }

      if (sub === 'logs') {
        return interaction.reply({ ...buildLogsMenu(), flags: MessageFlags.Ephemeral });
      }

      if (sub === 'keys') {
        const chunks = configKeyList().map((key) => describeConfigKey(key));
        const half = Math.ceil(chunks.length / 2);
        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Clés de configuration',
            fields: [
              { name: 'Clés 1', value: chunks.slice(0, half).join('\n').slice(0, 1024) },
              { name: 'Clés 2', value: chunks.slice(half).join('\n').slice(0, 1024) },
            ],
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      const key = interaction.options.getString('cle', true).trim();

      if (sub === 'reset') {
        if (!(key in CONFIG_KEYS)) return interaction.reply({ embeds: [buildError('Clé inconnue.')], flags: MessageFlags.Ephemeral });
        resetConfigValue(key);
        await log(interaction.client, 'config', 'changed', {
          guild: interaction.guild,
          title: 'Config reset',
          fields: [
            { name: 'Clé', value: key, inline: true },
            { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Config reset', description: `\`${key}\` remis à sa valeur par défaut.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!(key in CONFIG_KEYS)) {
        return interaction.reply({ embeds: [buildError(`Clé inconnue: \`${key}\`. Voir \`/config keys\`.`)] , flags: MessageFlags.Ephemeral });
      }

      const raw = interaction.options.getString('valeur', true);
      const value = await parseValue(interaction.guild, key, raw);
      setConfigValue(key, value);

      await log(interaction.client, 'config', 'changed', {
        guild: interaction.guild,
        fields: [
          { name: 'Clé', value: key, inline: true },
          { name: 'Valeur', value: displayConfigValue(key, value).slice(0, 1000), inline: false },
          { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Config mise à jour', fields: [{ name: key, value: displayConfigValue(key, value) }] })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error(`[alln-utils] /config: ${err.stack ?? err.message}`);
      const payload = { embeds: [buildError(err.message ?? 'Erreur de configuration.')], flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(() => null);
      return interaction.reply(payload).catch(() => null);
    }
  },
};

export { getConfig };
