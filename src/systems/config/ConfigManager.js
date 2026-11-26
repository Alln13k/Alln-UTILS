import { CONFIG_KEYS, getConfig, resetConfigValue, setConfigValue } from '../../config.js';
import { log } from '../../logger.js';
import { isAdmin } from '../../permissions.js';
import { safeError } from '../../respond.js';
import { formatLogValue } from './ConfigRegistry.js';
import { configSessionOwner } from './ConfigSessions.js';

export async function assertConfigAccess(interaction) {
  if (!interaction.guildId) {
    await safeError(interaction, 'La configuration est réservée au serveur.');
    return false;
  }
  if (!isAdmin(interaction.member)) {
    await safeError(interaction, 'Seuls les administrateurs peuvent modifier la configuration.');
    return false;
  }

  const ownerId = configSessionOwner(interaction);
  if (ownerId && ownerId !== interaction.user.id) {
    await safeError(interaction, 'Cette session de configuration appartient à un autre administrateur.');
    return false;
  }

  return true;
}

async function logChange(interaction, categoryId, key, before, after) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const meta = CONFIG_KEYS[key];
  await log(interaction.client, 'config', 'changed', {
    guild: interaction.guild,
    title: `Configuration — ${meta?.label ?? key}`,
    fields: [
      { name: 'Catégorie', value: categoryId, inline: true },
      { name: 'Clé', value: `\`${key}\``, inline: true },
      { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Avant', value: formatLogValue(before), inline: false },
      { name: 'Après', value: formatLogValue(after), inline: false },
    ],
  }).catch(() => null);
}

export async function saveConfigChange(interaction, categoryId, key, value) {
  if (!(key in CONFIG_KEYS)) throw new Error('Clé de configuration inconnue.');
  const before = getConfig()[key];
  const next = setConfigValue(key, value);
  const after = next[key];
  await logChange(interaction, categoryId, key, before, after);
  return after;
}

export async function resetConfigChange(interaction, categoryId, key) {
  if (!(key in CONFIG_KEYS)) throw new Error('Clé de configuration inconnue.');
  const before = getConfig()[key];
  const next = resetConfigValue(key);
  const after = next[key];
  await logChange(interaction, categoryId, key, before, after);
  return after;
}
