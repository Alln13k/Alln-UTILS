import { getConfig } from '../config.js';
import { safeError, safeShowModal } from '../respond.js';
import { buildTicketModal } from '../ticketForms.js';
import { handleConfigSelect } from '../systems/config/ConfigInteractionHandler.js';

/**
 * Route unique pour tous les menus de sélection (String, Channel, Role, User,
 * Mentionable). Le routeur principal appelle ce module pour chaque
 * interaction `isAnySelectMenu()`.
 */
export async function handleSelect(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('config:')) return handleConfigSelect(interaction);

  if (customId === 'ticket_category') {
    const category = interaction.values?.[0] ?? 'autre';
    if (!getConfig().ticketCategoryId) {
      return safeError(interaction, 'Aucune catégorie de tickets configurée.');
    }
    return safeShowModal(interaction, buildTicketModal(category));
  }

  return false;
}
