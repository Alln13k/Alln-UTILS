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
import {
  addGiveawayParticipant,
  averageNote,
  getAnnouncement,
  getEscrow,
  getGiveaway,
  getPoll,
  getSuggestion,
  getTicketByChannel,
  listButtonRoles,
  listReports,
  listTickets,
  listTools,
  setButtonRoleChoice,
  updateEscrow,
  updatePoll,
  updateSuggestion,
  updateTicket,
} from '../db.js';
import { buildEmbed } from '../embeds.js';
import { buildConfigPage, buildLogsCategory, buildLogsEventsPage, buildLogsMenu } from '../configUi.js';
import { handleWizardButton } from '../configWizard.js';
import { buildGiveawayListPage, buildGiveawayPayload } from '../giveawayUi.js';
import { buildPollPayload } from '../pollUi.js';
import { buildSuggestionPayload } from '../suggestionUi.js';
import { isLogEnabled, log, setLogEvent } from '../logger.js';
import { executeBulk, cancelBulk } from '../commands/bulk.js';
import { buildHelpCategoryEmbed } from '../commands/help_panel.js';
import { buildEscrowEmbed, buildEscrowRow } from '../commands/mm.js';
import { acceptNsfw, acceptRules } from '../services/rulesGate.js';
import { isAdmin, isStaff, isTicketStaff, replyError } from '../permissions.js';
import { checkGiveawayConditions } from '../services/giveaways.js';
import { performClose } from '../ticketClose.js';
import { refreshTicketPanel } from '../ticketUi.js';

const TICKETS_PER_PAGE = 5;
const TOOLS_PER_PAGE = 10;

export const TICKET_CATEGORIES = [
  { name: 'support', emoji: '🛠️', description: 'Aide et questions' },
  { name: 'achat', emoji: '💳', description: 'Achat / commande' },
  { name: 'scam-report', emoji: '🚨', description: 'Signaler un scam' },
  { name: 'autre', emoji: '📦', description: 'Toute autre demande' },
];

export function ticketCategories() {
  const categories = [...TICKET_CATEGORIES];
  for (const name of Object.keys(getConfig().ticketForms ?? {})) {
    if (!categories.some((category) => category.name === name)) {
      categories.push({ name, emoji: '📝', description: 'Formulaire personnalisé' });
    }
  }
  return categories.slice(0, 25);
}

export function buildTicketPanelComponents() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category')
    .setPlaceholder('Choisis une catégorie de ticket')
    .addOptions(
      ticketCategories().map((c) => ({
        label: c.name,
        value: c.name,
        emoji: c.emoji,
        description: c.description,
      })),
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_open').setLabel('Ouvrir un ticket').setStyle(ButtonStyle.Primary),
  );

  return [new ActionRowBuilder().addComponents(menu), row];
}

function canManageLogs(member) {
  if (!member) return false;
  if (isAdmin(member)) return true;
  const { staffRoleId } = getConfig();
  return Boolean(staffRoleId && member.roles?.cache?.has(staffRoleId));
}

export async function handleButton(interaction) {
  const [base, payload] = interaction.customId.split(':');

  switch (base) {
    case 'ticket_open':
      return showCategorySelect(interaction);
    case 'ticket_claim':
      return claimTicket(interaction);
    case 'ticket_rename':
      return showRenameModal(interaction);
    case 'ticket_close':
      return closeTicket(interaction);
    case 'tickets_page':
      return paginateTickets(interaction, Number.parseInt(payload ?? '0', 10));
    case 'tools_page':
      return paginateTools(interaction, Number.parseInt(payload ?? '0', 10));
    case 'config_page':
      return paginateConfig(interaction, Number.parseInt(payload ?? '0', 10));
    case 'config_logs_menu':
      return openLogsMenu(interaction);
    case 'cfgw':
      return handleWizardButton(interaction);
    case 'logs_events_page':
      return paginateLogEvents(interaction);
    case 'giveaway_join':
      return joinGiveaway(interaction, Number.parseInt(payload ?? '0', 10));
    case 'giveaway_list_page':
      return paginateGiveaways(interaction, Number.parseInt(payload ?? '0', 10));
    case 'suggest_vote':
      return voteSuggestion(interaction);
    case 'suggest_comment':
      return commentSuggestion(interaction);
    case 'poll_vote':
      return votePollButton(interaction);
    case 'rules_accept':
      return acceptRulesButton(interaction);
    case 'nsfw_accept':
      return acceptNsfwButton(interaction);
    case 'announce_details':
      return showAnnouncementDetails(interaction, payload);
    case 'mm_confirm':
      return confirmEscrow(interaction, payload);
    case 'reports_refresh':
      return refreshReports(interaction);
    case 'bulk_confirm':
      return executeBulk(interaction, payload);
    case 'bulk_cancel':
      return cancelBulk(interaction, payload);
    default:
      return null;
  }
}

export async function handleSelect(interaction) {
  if (interaction.customId === 'ticket_category') {
    return openTicketModal(interaction, interaction.values[0]);
  }

  if (interaction.customId === 'help_select') {
    return filterHelp(interaction);
  }

  if (interaction.customId === 'help_panel_select') {
    return showHelpCategory(interaction);
  }

  if (interaction.customId === 'buttonrole_select') {
    return toggleButtonRoles(interaction);
  }

  if (interaction.customId === 'logs_category') {
    return showLogsCategory(interaction);
  }

  if (interaction.customId.startsWith('logs_event:')) {
    return toggleLogEvent(interaction);
  }

  if (interaction.customId.startsWith('poll_select:')) {
    return votePollSelect(interaction);
  }

  return null;
}

function openTicketModal(interaction, category) {
  const questions = getConfig().ticketForms?.[category];
  if (Array.isArray(questions) && questions.length > 0) {
    const modal = new ModalBuilder()
      .setCustomId(`ticket_form_modal:${category}`)
      .setTitle(`Ticket — ${category}`.slice(0, 45))
      .addComponents(
        questions.slice(0, 5).map((question, index) =>
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(`tq_${index}`)
              .setLabel(String(question).slice(0, 45))
              .setStyle(index === 0 ? TextInputStyle.Short : TextInputStyle.Paragraph)
              .setMaxLength(index === 0 ? 120 : 1000)
              .setRequired(true),
          ),
        ),
      );
    return interaction.showModal(modal);
  }

  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal:${category}`)
    .setTitle(`Ticket — ${category}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket_subject')
          .setLabel('Sujet')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(120)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket_description')
          .setLabel('Description courte')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true),
      ),
    );

  return interaction.showModal(modal);
}

async function showCategorySelect(interaction) {
  try {
    const config = getConfig();
    if (!config.ticketCategoryId) {
      return replyError(interaction, 'Aucune catégorie de tickets configurée.');
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_category')
      .setPlaceholder('Choisis une catégorie de ticket')
      .addOptions(
        ticketCategories().map((c) => ({
          label: c.name,
          value: c.name,
          emoji: c.emoji,
          description: c.description,
        })),
      );

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Nouveau ticket', description: 'Sélectionne la catégorie qui correspond à ta demande.' })],
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(`[alln-utils] select ticket: ${err.stack ?? err.message}`);
    return replyError(interaction, 'Impossible d\'ouvrir le sélecteur.');
  }
}

async function claimTicket(interaction) {
  try {
    if (!isTicketStaff(interaction.member)) return replyError(interaction, 'Claim réservé au staff.');

    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket) return replyError(interaction, 'Ce salon n\'est pas un ticket.');
    if (ticket.status === 'closed') return replyError(interaction, 'Ticket déjà fermé.');
    if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id) {
      return replyError(interaction, `Déjà pris en charge par <@${ticket.claimedBy}>.`);
    }

    const updated = updateTicket(interaction.channelId, {
      status: 'claimed',
      claimedBy: interaction.user.id,
    });

    await refreshTicketPanel(interaction.guild, updated);

    await log(interaction.client, 'tickets', 'claim', {
      guild: interaction.guild,
      fields: [
        { name: 'Ticket', value: `#${ticket.id} — <#${ticket.channelId}>`, inline: true },
        { name: 'Staff', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Ticket claimed', description: `Ticket #${ticket.id} pris en charge par <@${interaction.user.id}>.` })],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(`[alln-utils] claim: ${err.stack ?? err.message}`);
    return replyError(interaction, 'Claim impossible.');
  }
}

async function showRenameModal(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket) return replyError(interaction, 'Ce salon n\'est pas un ticket.');
  if (!isTicketStaff(interaction.member) && interaction.user.id !== ticket.userId) {
    return replyError(interaction, 'Rename réservé à l\'auteur du ticket ou au staff.');
  }

  const modal = new ModalBuilder()
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

  return interaction.showModal(modal);
}

async function closeTicket(interaction) {
  try {
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket) return replyError(interaction, 'Ce salon n\'est pas un ticket.');
    if (!isTicketStaff(interaction.member) && interaction.user.id !== ticket.userId) {
      return replyError(interaction, 'Fermeture réservée à l\'auteur du ticket ou au staff.');
    }

    await interaction.update({
      embeds: [buildEmbed({ dark: true, title: 'Fermeture', description: 'Génération du transcript…' })],
      components: [],
    }).catch(() => null);

    const result = await performClose(interaction, { reason: 'Fermeture via bouton' });
    if (!result.ok) return replyError(interaction, result.error);
    return null;
  } catch (err) {
    console.error(`[alln-utils] close ticket: ${err.stack ?? err.message}`);
    return replyError(interaction, 'Fermeture impossible. Vérifie les permissions du bot.');
  }
}

async function paginateTickets(interaction, page) {
  try {
    if (!isTicketStaff(interaction.member)) return replyError(interaction, 'Liste réservée au staff.');

    const open = listTickets('open').concat(listTickets('claimed'));
    const pages = Math.max(1, Math.ceil(open.length / TICKETS_PER_PAGE));
    const current = Math.min(Math.max(page, 0), pages - 1);
    const slice = open.slice(current * TICKETS_PER_PAGE, current * TICKETS_PER_PAGE + TICKETS_PER_PAGE);

    const description = slice.length
      ? slice.map((t) => `**#${t.id}** <#${t.channelId}> — <@${t.userId}> — ${t.status}${t.claimedBy ? ` (<@${t.claimedBy}>)` : ''}`).join('\n')
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

    const payload = {
      embeds: [buildEmbed({ dark: true, title: `Tickets ouverts — page ${current + 1}/${pages}`, description })],
      components: [row],
    };

    if (interaction.isButton()) return interaction.update(payload);
    return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  } catch (err) {
    console.error(`[alln-utils] pagination tickets: ${err.stack ?? err.message}`);
    return replyError(interaction, 'Pagination impossible.');
  }
}

async function paginateTools(interaction, page) {
  try {
    const tools = listTools().sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    const pages = Math.max(1, Math.ceil(tools.length / TOOLS_PER_PAGE));
    const current = Math.min(Math.max(page, 0), pages - 1);
    const slice = tools.slice(current * TOOLS_PER_PAGE, current * TOOLS_PER_PAGE + TOOLS_PER_PAGE);

    const description = slice.length
      ? slice.map((t) => {
        const avg = averageNote(t.slug);
        return `**${t.name}** \`${t.category}\` — ${avg ? `${avg}/5` : 'sans vouch'}`;
      }).join('\n')
      : 'Aucune tool enregistrée.';

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tools_page:${current - 1}`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(current === 0),
      new ButtonBuilder()
        .setCustomId(`tools_page:${current + 1}`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(current >= pages - 1),
    );

    const payload = {
      embeds: [buildEmbed({ dark: true, title: `Tools — page ${current + 1}/${pages}`, description })],
      components: [row],
    };

    if (interaction.isButton()) return interaction.update(payload);
    return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  } catch (err) {
    console.error(`[alln-utils] pagination tools: ${err.stack ?? err.message}`);
    return replyError(interaction, 'Pagination impossible.');
  }
}

async function filterHelp(interaction) {
  const category = interaction.values[0];
  const commands = [...interaction.client.commands.values()].filter((c) => (c.category ?? 'Autres') === category);

  const description = commands.length
    ? commands.map((c) => `**/${c.data.name}** — ${c.description}`).join('\n')
    : 'Aucune commande dans cette catégorie.';

  return interaction.update({
    embeds: [buildEmbed({ dark: true, title: `Alln UTILS — ${category}`, description })],
  });
}

async function paginateConfig(interaction, page) {
  if (!isAdmin(interaction.member)) return replyError(interaction, 'Configuration réservée aux administrateurs.');
  return interaction.update(buildConfigPage(page)).catch(() => null);
}

async function openLogsMenu(interaction) {
  if (!canManageLogs(interaction.member)) return replyError(interaction, 'Réservé aux administrateurs ou au staff.');
  return interaction.update(buildLogsMenu()).catch(() => null);
}

async function showLogsCategory(interaction) {
  if (!canManageLogs(interaction.member)) return replyError(interaction, 'Réservé aux administrateurs ou au staff.');
  const category = interaction.values[0];
  return interaction.update(buildLogsCategory(category)).catch(() => null);
}

async function toggleLogEvent(interaction) {
  if (!canManageLogs(interaction.member)) return replyError(interaction, 'Réservé aux administrateurs ou au staff.');
  const category = interaction.customId.split(':')[1];
  const event = interaction.values[0];
  const enabled = !isLogEnabled(category, event);
  setLogEvent(category, event, enabled);
  return interaction.update(buildLogsCategory(category)).catch(() => null);
}

async function paginateLogEvents(interaction) {
  if (!canManageLogs(interaction.member)) return replyError(interaction, 'Réservé aux administrateurs ou au staff.');
  const [, category, page] = interaction.customId.split(':');
  return interaction.update(buildLogsEventsPage(category, Number.parseInt(page ?? '0', 10))).catch(() => null);
}

async function joinGiveaway(interaction, id) {
  try {
    const giveaway = getGiveaway(id);
    if (!giveaway) return replyError(interaction, 'Giveaway introuvable.');
    if (giveaway.ended) return replyError(interaction, 'Ce giveaway est terminé.');

    const member = interaction.member
      ?? (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
    if (!member) return replyError(interaction, 'Membre introuvable.');

    const check = checkGiveawayConditions(member, giveaway);
    if (!check.ok) return replyError(interaction, check.reason);

    const result = addGiveawayParticipant(id, interaction.user.id);
    if (!result.ok) return replyError(interaction, result.reason);

    if (interaction.message) {
      await interaction.message.edit(buildGiveawayPayload(result.giveaway)).catch(() => null);
    }

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Participation enregistrée', description: `Tu participes à **${giveaway.prize}**. Bonne chance !` })],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(`[alln-utils] giveaway join: ${err.message}`);
    return replyError(interaction, 'Participation impossible.');
  }
}

async function paginateGiveaways(interaction, page) {
  if (!isStaff(interaction.member)) return replyError(interaction, 'Liste réservée au staff.');
  return interaction.update(buildGiveawayListPage(page)).catch(() => null);
}

async function voteSuggestion(interaction) {
  try {
    const [, direction, rawId] = interaction.customId.split(':');
    const id = Number.parseInt(rawId, 10);
    const suggestion = getSuggestion(id);
    if (!suggestion) return replyError(interaction, 'Suggestion introuvable.');
    if (suggestion.status !== 'pending') return replyError(interaction, 'Cette suggestion est déjà traitée.');

    const up = new Set(suggestion.votes?.up ?? []);
    const down = new Set(suggestion.votes?.down ?? []);
    const userId = interaction.user.id;
    const wasUp = up.has(userId);
    const wasDown = down.has(userId);

    up.delete(userId);
    down.delete(userId);

    if (direction === 'up' && !wasUp) up.add(userId);
    if (direction === 'down' && !wasDown) down.add(userId);

    const updated = updateSuggestion(id, { votes: { up: [...up], down: [...down] } });
    return interaction.update(buildSuggestionPayload(updated)).catch(() => null);
  } catch (err) {
    console.error(`[alln-utils] suggest vote: ${err.message}`);
    return replyError(interaction, 'Vote impossible.');
  }
}

async function commentSuggestion(interaction) {
  const id = Number.parseInt(interaction.customId.split(':')[1], 10);
  const suggestion = getSuggestion(id);
  if (!suggestion) return replyError(interaction, 'Suggestion introuvable.');

  const modal = new ModalBuilder()
    .setCustomId(`suggest_comment_modal:${id}`)
    .setTitle(`Commenter la suggestion #${id}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('suggest_comment_text')
          .setLabel('Ton commentaire')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(true),
      ),
    );

  return interaction.showModal(modal);
}

function applyPollVote(poll, userId, index) {
  const options = poll.options.map((option) => ({
    ...option,
    votes: (option.votes ?? []).filter((id) => id !== userId),
  }));

  if (index >= 0 && index < options.length) {
    options[index].votes.push(userId);
  }

  return updatePoll(poll.id, { options });
}

async function votePollButton(interaction) {
  try {
    const [, rawId, rawIndex] = interaction.customId.split(':');
    const poll = getPoll(Number.parseInt(rawId, 10));
    if (!poll) return replyError(interaction, 'Sondage introuvable.');
    if (poll.ended) return replyError(interaction, 'Sondage clôturé.');

    const index = Number.parseInt(rawIndex, 10);
    const already = poll.options[index]?.votes?.includes(interaction.user.id);
    const updated = applyPollVote(poll, interaction.user.id, already ? -1 : index);

    return interaction.update(buildPollPayload(updated)).catch(() => null);
  } catch (err) {
    console.error(`[alln-utils] poll vote: ${err.message}`);
    return replyError(interaction, 'Vote impossible.');
  }
}

async function votePollSelect(interaction) {
  try {
    const poll = getPoll(Number.parseInt(interaction.customId.split(':')[1], 10));
    if (!poll) return replyError(interaction, 'Sondage introuvable.');
    if (poll.ended) return replyError(interaction, 'Sondage clôturé.');

    const index = Number.parseInt(interaction.values[0], 10);
    const updated = applyPollVote(poll, interaction.user.id, index);
    return interaction.update(buildPollPayload(updated)).catch(() => null);
  } catch (err) {
    console.error(`[alln-utils] poll select: ${err.message}`);
    return replyError(interaction, 'Vote impossible.');
  }
}

async function toggleButtonRoles(interaction) {
  try {
    const roles = listButtonRoles();
    const selected = new Set(interaction.values);
    const member = interaction.member;

    for (const entry of roles) {
      const shouldHave = selected.has(entry.roleId);
      const has = member.roles.cache.has(entry.roleId);
      if (shouldHave && !has) {
        await member.roles.add(entry.roleId, 'Menu de rôles').catch(() => null);
        setButtonRoleChoice(member.id, entry.roleId, true);
      } else if (!shouldHave && has) {
        await member.roles.remove(entry.roleId, 'Menu de rôles').catch(() => null);
        setButtonRoleChoice(member.id, entry.roleId, false);
      }
    }

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Rôles mis à jour', description: 'Tes rôles ont été synchronisés avec le menu.' })],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(`[alln-utils] buttonrole: ${err.message}`);
    return replyError(interaction, 'Mise à jour des rôles impossible.');
  }
}

async function acceptRulesButton(interaction) {
  try {
    const member = interaction.member
      ?? (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
    if (!member) return replyError(interaction, 'Membre introuvable.');

    const result = await acceptRules(interaction.client, member, interaction.guild);
    if (!result.ok) return replyError(interaction, result.reason);

    return interaction.reply({
      embeds: [buildEmbed({
        dark: true,
        title: 'Règlement accepté',
        description: 'Merci ! Le rôle vérifié t\'a été attribué.',
      })],
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
  } catch (err) {
    console.error(`[alln-utils] rules accept: ${err.message}`);
    return replyError(interaction, 'Acceptation impossible.');
  }
}

async function acceptNsfwButton(interaction) {
  try {
    const member = interaction.member
      ?? (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
    if (!member) return replyError(interaction, 'Membre introuvable.');

    const result = await acceptNsfw(interaction.client, member, interaction.guild);
    if (!result.ok) return replyError(interaction, result.reason);

    return interaction.reply({
      embeds: [buildEmbed({
        dark: true,
        title: 'Accès NSFW accordé',
        description: 'Le rôle NSFW t\'a été attribué.',
      })],
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
  } catch (err) {
    console.error(`[alln-utils] nsfw accept: ${err.message}`);
    return replyError(interaction, 'Vérification NSFW impossible.');
  }
}

async function showAnnouncementDetails(interaction, id) {
  const data = getAnnouncement(id);
  if (!data) return replyError(interaction, 'Annonce introuvable.');

  return interaction.reply({
    embeds: [buildEmbed({
      dark: true,
      title: `📢 ${data.title}`,
      description: (data.details ?? data.description).slice(0, 4000),
      fields: [
        { name: 'Publiée par', value: `<@${data.authorId}>`, inline: true },
      ],
    })],
    flags: MessageFlags.Ephemeral,
  }).catch(() => null);
}

async function showHelpCategory(interaction) {
  const category = interaction.values[0];
  return interaction.update({
    embeds: [buildHelpCategoryEmbed(interaction.client, category)],
  }).catch(() => null);
}

async function confirmEscrow(interaction, rawId) {
  try {
    const id = Number.parseInt(rawId ?? interaction.customId.split(':')[1], 10);
    const side = interaction.customId.split(':')[2];
    const escrow = getEscrow(id);
    if (!escrow) return replyError(interaction, 'Escrow introuvable.');
    if (escrow.status === 'closed') return replyError(interaction, 'Escrow déjà clôturé.');
    if (side !== 'a' && side !== 'b') return replyError(interaction, 'Confirmation invalide.');

    const expected = side === 'a' ? escrow.userA : escrow.userB;
    if (interaction.user.id !== expected) {
      return replyError(interaction, `Seule la partie ${side === 'a' ? 'A' : 'B'} peut confirmer.`);
    }

    const confirmations = { ...(escrow.confirmations ?? {}), [side]: true };
    const updated = updateEscrow(id, { confirmations });

    const channel = await interaction.guild.channels.fetch(escrow.channelId).catch(() => null);
    const panel = channel?.isTextBased()
      ? await channel.messages.fetch(escrow.panelMessageId).catch(() => null)
      : null;
    if (panel) {
      await panel.edit({
        embeds: [buildEscrowEmbed(updated)],
        components: buildEscrowRow(updated),
      }).catch(() => null);
    }

    await log(interaction.client, 'escrow', 'confirm', {
      guild: interaction.guild,
      fields: [
        { name: 'ID', value: `#${id}`, inline: true },
        { name: 'Partie', value: side.toUpperCase(), inline: true },
        { name: 'Confirmations', value: `A: ${confirmations.a ? '✅' : '⏳'} — B: ${confirmations.b ? '✅' : '⏳'}`, inline: true },
      ],
    });

    const ready = Boolean(confirmations.a && confirmations.b);
    return interaction.reply({
      embeds: [buildEmbed({
        dark: true,
        title: `Escrow #${id} — confirmation enregistrée`,
        description: ready
          ? 'Les deux parties ont confirmé. Un staff peut clôturer avec `/mm close`.'
          : 'En attente de la confirmation de l\'autre partie.',
      })],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(`[alln-utils] escrow confirm: ${err.message}`);
    return replyError(interaction, 'Confirmation impossible.');
  }
}

async function refreshReports(interaction) {
  try {
    if (!isStaff(interaction.member)) return replyError(interaction, 'Liste réservée au staff.');

    const reports = listReports('open');
    const description = reports.length
      ? reports.slice(-20).reverse().map((report) =>
        `**#${report.id}** — <@${report.reportedId}> — signalé par <@${report.reporterId}> — ${report.status}${report.channelId ? ` — <#${report.channelId}>` : ''}`,
      ).join('\n')
      : 'Aucun signalement ouvert.';

    const row = reports.length
      ? new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('reports_refresh')
          .setLabel('Actualiser')
          .setStyle(ButtonStyle.Secondary),
      )
      : null;

    return interaction.update({
      embeds: [buildEmbed({
        dark: true,
        title: `Signalements ouverts — ${reports.length}`,
        description: description.slice(0, 4000),
      })],
      components: row ? [row] : [],
    }).catch(() => null);
  } catch (err) {
    console.error(`[alln-utils] reports refresh: ${err.message}`);
    return replyError(interaction, 'Actualisation impossible.');
  }
}
