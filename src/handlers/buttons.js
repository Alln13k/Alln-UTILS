import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getConfig } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { isTicketStaff } from '../permissions.js';
import { safeDefer, safeError, safeReply, safeShowModal, safeUpdate } from '../respond.js';
import {
  getSuggestion, getTicketByChannel, listTickets, updateSuggestion, updateTicket,
} from '../db.js';
import { buildSuggestionPayload } from '../suggestionUi.js';
import { buildHelpPage } from '../helpUi.js';
import { performClose } from '../ticketClose.js';
import { acceptRules } from '../services/rulesGate.js';
import { handleConfigButton } from '../systems/config/ConfigInteractionHandler.js';

const TICKETS_PER_PAGE = 5;
const EPHEMERAL = { flags: MessageFlags.Ephemeral };

export function buildTicketPanelComponents() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category')
    .setPlaceholder('Choisis une catégorie de ticket')
    .addOptions([
      { label: 'Support', value: 'support', emoji: '🛠️', description: 'Aide et questions' },
      { label: 'Achat', value: 'achat', emoji: '💳', description: 'Achat / commande' },
      { label: 'Autre', value: 'autre', emoji: '📦', description: 'Toute autre demande' },
    ]);

  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_open')
        .setLabel('Ouvrir un ticket')
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

export async function handleButton(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('config:')) return handleConfigButton(interaction);

  if (customId.startsWith('help_')) {
    const page = customId === 'help_home' ? null : customId.slice(5);
    return safeUpdate(interaction, buildHelpPage(page));
  }

  if (customId === 'rules_accept') return acceptRulePanel(interaction);

  if (customId === 'ticket_open') return showCategorySelect(interaction);
  if (customId === 'ticket_claim') return claimTicket(interaction);
  if (customId === 'ticket_close') return closeTicket(interaction);
  if (customId === 'ticket_rename') {
    return safeShowModal(interaction, renameModal());
  }
  if (customId === 'ticket_add') {
    return safeShowModal(interaction, userModal('ticket_add_modal', 'Ajouter un utilisateur', 'ticket_add_user'));
  }
  if (customId === 'ticket_remove') {
    return safeShowModal(interaction, userModal('ticket_remove_modal', 'Retirer un utilisateur', 'ticket_remove_user'));
  }
  if (customId.startsWith('tickets_page:')) {
    return paginateTickets(interaction, Number.parseInt(customId.split(':')[1], 10) || 0);
  }

  if (customId.startsWith('suggest_vote:')) {
    const [, direction, id] = customId.split(':');
    return voteSuggestion(interaction, direction, id);
  }

  return false;
}

function renameModal() {
  return new ModalBuilder()
    .setCustomId('ticket_rename_modal')
    .setTitle('Renommer le ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket_new_name')
          .setLabel('Nouveau nom')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(40)
          .setRequired(true),
      ),
    );
}

function userModal(customId, title, inputId) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(inputId)
          .setLabel('ID ou mention utilisateur')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(30)
          .setRequired(true),
      ),
    );
}

async function acceptRulePanel(interaction) {
  if (!(await safeDefer(interaction, EPHEMERAL))) return true;

  const config = getConfig();
  if (!config.verifiedRoleId) {
    return safeReply(interaction, 'Aucun rôle vérifié n’est configuré. Contacte le staff.');
  }

  const result = await acceptRules(interaction.client, interaction.member, interaction.guild);
  return safeReply(interaction, result.ok
    ? '✅ Règlement accepté, rôle vérifié attribué.'
    : `❌ ${result.reason}`);
}

async function showCategorySelect(interaction) {
  if (!getConfig().ticketCategoryId) {
    return safeError(interaction, 'Aucune catégorie de tickets configurée.');
  }

  return safeReply(interaction, {
    embeds: [buildEmbed({
      dark: true,
      title: 'Nouveau ticket',
      description: 'Sélectionne la catégorie qui correspond à ta demande.',
    })],
    components: [buildTicketPanelComponents()[0]],
    ...EPHEMERAL,
  });
}

async function claimTicket(interaction) {
  if (!isTicketStaff(interaction.member)) return safeError(interaction, 'Claim réservé au staff.');
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket) return safeError(interaction, 'Ce salon n’est pas un ticket.');
  if (ticket.status === 'closed') return safeError(interaction, 'Ticket déjà fermé.');
  if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id) {
    return safeError(interaction, `Déjà pris en charge par <@${ticket.claimedBy}>.`);
  }

  if (!(await safeDefer(interaction, EPHEMERAL))) return true;

  updateTicket(interaction.channelId, { status: 'claimed', claimedBy: interaction.user.id });
  await log(interaction.client, 'tickets', 'claim', {
    guild: interaction.guild,
    fields: [
      { name: 'Ticket', value: `#${ticket.id} — <#${ticket.channelId}>`, inline: true },
      { name: 'Staff', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return safeReply(interaction, {
    embeds: [buildEmbed({ dark: true, title: 'Ticket claimed', description: `Ticket #${ticket.id} pris en charge.`, })],
    ...EPHEMERAL,
  });
}

async function closeTicket(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket) return safeError(interaction, 'Ce salon n’est pas un ticket.');
  if (!isTicketStaff(interaction.member) && interaction.user.id !== ticket.userId) {
    return safeError(interaction, 'Fermeture réservée à l’auteur du ticket ou au staff.');
  }

  if (!(await safeDefer(interaction, EPHEMERAL))) return true;

  const result = await performClose(interaction, { reason: 'Fermeture via bouton' });
  return safeReply(interaction, result.ok
    ? `✅ Ticket #${result.ticket.id} fermé. Transcript ${result.transcriptSent ? 'envoyé' : 'indisponible'}.`
    : `❌ ${result.error}`);
}

async function voteSuggestion(interaction, direction, id) {
  if (!['up', 'down'].includes(direction)) return safeError(interaction, 'Vote invalide.');

  const suggestion = getSuggestion(id);
  if (!suggestion) return safeError(interaction, 'Suggestion introuvable.');

  const votes = {
    up: (suggestion.votes?.up ?? []).filter((userId) => userId !== interaction.user.id),
    down: (suggestion.votes?.down ?? []).filter((userId) => userId !== interaction.user.id),
  };
  votes[direction].push(interaction.user.id);

  const updated = updateSuggestion(id, { votes });
  if (!updated) return safeError(interaction, 'Suggestion introuvable.');

  return safeUpdate(interaction, buildSuggestionPayload(updated));
}

async function paginateTickets(interaction, page) {
  if (!isTicketStaff(interaction.member)) return safeError(interaction, 'Liste réservée au staff.');

  const open = [...listTickets('open'), ...listTickets('claimed')];
  const pages = Math.max(1, Math.ceil(open.length / TICKETS_PER_PAGE));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const slice = open.slice(current * TICKETS_PER_PAGE, (current + 1) * TICKETS_PER_PAGE);

  const description = slice.length
    ? slice.map((ticket) =>
      `**#${ticket.id}** <#${ticket.channelId}> — <@${ticket.userId}> — ${ticket.status}${ticket.claimedBy ? ` (<@${ticket.claimedBy}>)` : ''}`).join('\n')
    : 'Aucun ticket ouvert.';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tickets_page:${current - 1}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current === 0),
    new ButtonBuilder()
      .setCustomId(`tickets_page:${current + 1}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current >= pages - 1),
  );

  return safeUpdate(interaction, {
    embeds: [buildEmbed({ dark: true, title: `Tickets ouverts — page ${current + 1}/${pages}`, description })],
    components: [row],
  });
}
