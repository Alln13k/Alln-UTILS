import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { CONFIG_KEYS, configKeyList, getConfig, setConfigValue } from './config.js';
import {
  configValueHint,
  displayConfigValue,
  encodeConfigValue,
  parseValue,
} from './configParse.js';
import { buildEmbed } from './embeds.js';
import { log } from './logger.js';
import { isAdmin, replyError } from './permissions.js';

const WIZARD_TTL_MS = 15 * 60 * 1000;
const states = new Map();

function pruneStates() {
  const now = Date.now();
  for (const [token, state] of states) {
    if (state.expiresAt <= now) states.delete(token);
  }
}

function findState(token) {
  pruneStates();
  return states.get(token) ?? null;
}

function ownsState(state, interaction) {
  return Boolean(
    state
    && interaction.guild
    && state.guildId === interaction.guild.id
    && state.userId === interaction.user.id
    && isAdmin(interaction.member),
  );
}

async function rejectState(interaction) {
  return replyError(interaction, 'Session de configuration invalide ou expirée. Relance `/config wizard`.');
}

function buildStepPayload(state, error = null, raw = null) {
  const key = state.keys[state.index];
  if (!key) return buildSummaryPayload(state);

  const meta = CONFIG_KEYS[key];
  const config = getConfig();
  const fields = [
    { name: 'Étape', value: `${state.index + 1}/${state.keys.length}`, inline: true },
    { name: 'Type', value: meta.type, inline: true },
    { name: 'Format', value: configValueHint(key), inline: false },
    { name: 'Défaut', value: String(displayConfigValue(key, meta.default)).slice(0, 400), inline: false },
    { name: 'Valeur actuelle', value: String(displayConfigValue(key, config[key])).slice(0, 1024), inline: false },
  ];

  if (raw !== null && raw !== undefined) {
    fields.push({ name: 'Valeur saisie', value: String(raw).slice(0, 1000) || '(vide)', inline: false });
  }
  if (error) {
    fields.push({ name: 'Erreur', value: String(error).slice(0, 1000), inline: false });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfgw:${state.token}:edit`)
      .setLabel('Modifier')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`cfgw:${state.token}:skip`)
      .setLabel('Passer')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cfgw:${state.token}:skipall`)
      .setLabel('Passer tout')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embeds: [buildEmbed({
      dark: true,
      title: '⚙️ Configuration guidée',
      description: `**${meta.label}**\nClé : \`${key}\`\n\nClique sur **Modifier**, ou passe cette étape si elle ne te concerne pas.`,
      fields,
    })],
    components: [row],
  };
}

function buildSummaryPayload(state) {
  const details = state.changed.length
    ? state.changed
      .map(({ key, before, after }) => `\`${key}\` : ${before} → ${after}`)
      .join('\n')
    : 'Aucune clé modifiée.';

  return {
    embeds: [buildEmbed({
      dark: true,
      title: '✅ Configuration guidée terminée',
      description: 'L\'assistant universel a parcouru les clés demandées.',
      fields: [
        { name: 'Clés parcourues', value: `${Math.min(state.index, state.keys.length)}/${state.keys.length}`, inline: true },
        { name: 'Modifiées', value: String(state.changed.length), inline: true },
        { name: 'Passées', value: String(state.skipped), inline: true },
        { name: 'Détails', value: details.slice(0, 1024), inline: false },
      ],
    })],
    components: [],
  };
}

async function renderNext(interaction, state) {
  if (state.index >= state.keys.length) {
    states.delete(state.token);
    return interaction.update(buildSummaryPayload(state)).catch(() => null);
  }
  return interaction.update(buildStepPayload(state)).catch(() => null);
}

export async function startWizard(interaction) {
  const now = Date.now();
  const state = {
    token: randomUUID(),
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    keys: configKeyList(),
    index: 0,
    changed: [],
    skipped: 0,
    createdAt: now,
    expiresAt: now + WIZARD_TTL_MS,
  };

  states.set(state.token, state);

  return interaction.reply({ ...buildStepPayload(state), flags: MessageFlags.Ephemeral });
}

function showWizardModal(interaction, state) {
  const key = state.keys[state.index];
  const meta = CONFIG_KEYS[key];
  const current = getConfig()[key];
  const nullable = ['channel', 'role', 'string', 'hex'].includes(meta.type) || meta.type.endsWith('List');
  const paragraph = ['json', 'string'].includes(meta.type) || meta.type.endsWith('List');

  const modal = new ModalBuilder()
    .setCustomId(`cfgw_modal:${state.token}`)
    .setTitle(`Config — ${key}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(`Valeur — ${key}`.slice(0, 45))
          .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setValue(encodeConfigValue(key, current).slice(0, 4000))
          .setMaxLength(4000)
          .setRequired(!nullable),
      ),
    );

  return interaction.showModal(modal);
}

export async function handleWizardButton(interaction) {
  const [, token, action] = interaction.customId.split(':');
  const state = findState(token);

  if (!state) return rejectState(interaction);
  if (!ownsState(state, interaction)) return rejectState(interaction);

  if (action === 'edit') {
    return showWizardModal(interaction, state);
  }

  if (action === 'skip') {
    state.skipped += 1;
    state.index += 1;
    return renderNext(interaction, state);
  }

  if (action === 'skipall') {
    state.skipped += state.keys.length - state.index;
    state.index = state.keys.length;
    return renderNext(interaction, state);
  }

  return null;
}

export async function handleWizardModal(interaction) {
  const token = interaction.customId.split(':')[1];
  const state = findState(token);

  if (!state) return rejectState(interaction);
  if (!ownsState(state, interaction)) return rejectState(interaction);

  const key = state.keys[state.index];
  if (!key) return rejectState(interaction);

  const raw = interaction.fields.getTextInputValue('value');

  try {
    const before = displayConfigValue(key, getConfig()[key]);
    const value = await parseValue(interaction.guild, key, raw);
    setConfigValue(key, value);
    const after = displayConfigValue(key, value);

    state.changed.push({ key, before, after });
    state.index += 1;

    await log(interaction.client, 'config', 'changed', {
      guild: interaction.guild,
      title: 'Config guidée — modification',
      fields: [
        { name: 'Clé', value: key, inline: true },
        { name: 'Avant', value: String(before).slice(0, 1000), inline: false },
        { name: 'Après', value: String(after).slice(0, 1000), inline: false },
        { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });

    return renderNext(interaction, state);
  } catch (err) {
    console.error(`[alln-utils] config wizard ${key}: ${err.stack ?? err.message}`);
    return interaction.update(buildStepPayload(state, err.message ?? 'Valeur invalide.', raw)).catch(() => null);
  }
}

export function resetWizardStates() {
  states.clear();
}
