import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { CONFIG_KEYS, getConfig } from '../../config.js';
import { buildEmbed } from '../../embeds.js';
import { safeError, safeReply, safeShowModal, safeUpdate } from '../../respond.js';
import { assertConfigAccess, resetConfigChange, saveConfigChange } from './ConfigManager.js';
import { buildConfigCategory, buildConfigEditor, buildConfigMainMenu } from './ConfigRenderer.js';
import {
  categoryById,
  displayValue,
  isListType,
  isModalType,
  keysForCategory,
  parseModalValue,
} from './ConfigRegistry.js';

function partsOf(interaction) {
  return interaction.customId.split(':');
}

async function confirm(interaction, key, value) {
  const meta = CONFIG_KEYS[key];
  const text = displayValue(key, value).slice(0, 500);
  await safeReply(interaction, {
    embeds: [buildEmbed({
      dark: true,
      title: '✅ Enregistré',
      description: `**${meta?.label ?? key}**\n${text}`,
    })],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleConfigButton(interaction) {
  if (!(await assertConfigAccess(interaction))) return;

  const parts = partsOf(interaction);
  const action = parts[1];

  try {
    if (action === 'main') {
      return await safeUpdate(interaction, buildConfigMainMenu());
    }

    if (action === 'open') {
      const categoryId = parts[2];
      if (!categoryById(categoryId)) return await safeError(interaction, 'Catégorie inconnue.');
      return await safeUpdate(interaction, buildConfigCategory(categoryId));
    }

    if (action === 'refresh') {
      if (!parts[2] || parts[2] === 'main') return await safeUpdate(interaction, buildConfigMainMenu());
      if (parts[3]) return await safeUpdate(interaction, buildConfigEditor(parts[2], parts[3]));
      return await safeUpdate(interaction, buildConfigCategory(parts[2]));
    }

    if (action === 'toggle') {
      const [, , categoryId, key] = parts;
      const meta = CONFIG_KEYS[key];
      if (!meta || meta.type !== 'bool') return await safeError(interaction, 'Réglage booléen inconnu.');
      const next = !Boolean(getConfig()[key]);
      const value = await saveConfigChange(interaction, categoryId, key, next);
      await safeUpdate(interaction, buildConfigEditor(categoryId, key));
      return await confirm(interaction, key, value);
    }

    if (action === 'reset') {
      const [, , categoryId, key] = parts;
      if (!CONFIG_KEYS[key]) return await safeError(interaction, 'Réglage inconnu.');
      const value = await resetConfigChange(interaction, categoryId, key);
      await safeUpdate(interaction, buildConfigEditor(categoryId, key));
      return await confirm(interaction, key, value);
    }

    if (action === 'modal') {
      const [, , categoryId, key] = parts;
      return await showConfigModal(interaction, categoryId, key);
    }

    return await safeError(interaction, 'Action de configuration inconnue.');
  } catch (err) {
    console.error(`[alln-utils] config button ${interaction.customId}: ${err.stack ?? err.message}`);
    return await safeError(interaction, err.message ?? 'Modification impossible.');
  }
}

export async function handleConfigSelect(interaction) {
  if (!(await assertConfigAccess(interaction))) return;

  const parts = partsOf(interaction);
  const action = parts[1];

  try {
    if (action === 'cat') {
      const categoryId = interaction.values[0];
      if (!categoryById(categoryId)) return await safeError(interaction, 'Catégorie inconnue.');
      return await safeUpdate(interaction, buildConfigCategory(categoryId));
    }

    if (action === 'pick') {
      const categoryId = parts[2];
      const key = interaction.values[0];
      if (!keysForCategory(categoryId).includes(key)) {
        return await safeError(interaction, 'Réglage inconnu dans cette catégorie.');
      }
      return await safeUpdate(interaction, buildConfigEditor(categoryId, key));
    }

    if (action === 'set') {
      const [, , categoryId, key] = parts;
      const meta = CONFIG_KEYS[key];
      if (!meta) return await safeError(interaction, 'Réglage inconnu.');
      if (!['channel', 'role', 'channelList', 'roleList'].includes(meta.type)) {
        return await safeError(interaction, 'Ce réglage ne se modifie pas avec un sélecteur.');
      }
      if (!interaction.values.length) return await safeError(interaction, 'Aucune valeur sélectionnée.');

      const value = isListType(meta.type) ? interaction.values : interaction.values[0];
      const saved = await saveConfigChange(interaction, categoryId, key, value);
      await safeUpdate(interaction, buildConfigEditor(categoryId, key));
      return await confirm(interaction, key, saved);
    }

    return await safeError(interaction, 'Sélection de configuration inconnue.');
  } catch (err) {
    console.error(`[alln-utils] config select ${interaction.customId}: ${err.stack ?? err.message}`);
    return await safeError(interaction, err.message ?? 'Modification impossible.');
  }
}

export async function handleConfigModal(interaction) {
  if (!(await assertConfigAccess(interaction))) return;

  const parts = partsOf(interaction);
  const categoryId = parts[2];
  const key = parts[3];

  try {
    const meta = CONFIG_KEYS[key];
    if (!meta) return await safeError(interaction, 'Réglage inconnu.');
    if (!isModalType(meta.type)) return await safeError(interaction, 'Ce réglage n’utilise pas de formulaire.');

    const raw = interaction.fields.getTextInputValue('value');
    const value = parseModalValue(key, raw);
    const saved = await saveConfigChange(interaction, categoryId, key, value);
    await safeUpdate(interaction, buildConfigEditor(categoryId, key));
    return await confirm(interaction, key, saved);
  } catch (err) {
    return await safeError(interaction, err.message ?? 'Valeur invalide.');
  }
}

async function showConfigModal(interaction, categoryId, key) {
  const meta = CONFIG_KEYS[key];
  if (!meta) return safeError(interaction, 'Réglage inconnu.');
  if (!isModalType(meta.type)) return safeError(interaction, 'Ce réglage n’utilise pas de formulaire.');

  const current = getConfig()[key];
  const maxLength = meta.type === 'json'
    ? 4000
    : meta.type === 'int'
      ? 10
      : meta.type === 'hex'
        ? 7
        : Math.min(4000, meta.maxLength ?? 1000);

  let value = '';
  if (meta.type === 'json') {
    const serialized = JSON.stringify(current ?? {});
    // Ne jamais préremplir un JSON tronqué : ce serait invalide à la soumission.
    if (serialized.length <= maxLength) value = serialized;
  } else if (current !== null && current !== undefined) {
    const serialized = String(current);
    if (serialized.length <= maxLength) value = serialized;
  }

  const style = meta.type === 'json' || (meta.type === 'string' && maxLength > 100)
    ? TextInputStyle.Paragraph
    : TextInputStyle.Short;

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(meta.label.slice(0, 45))
    .setStyle(style)
    .setRequired(true)
    .setMaxLength(maxLength);

  if (value) input.setValue(value);

  const modal = new ModalBuilder()
    .setCustomId(`config:modal:${categoryId}:${key}`)
    .setTitle(meta.label.slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(input));

  return safeShowModal(interaction, modal);
}
