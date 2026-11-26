import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildEmbed } from './embeds.js';

export const HELP_PAGES = {
  mod: {
    label: 'Modération',
    emoji: '🛡️',
    description: [
      '`/ban` — bannir un membre',
      '`/kick` — expulser un membre',
      '`/mute` — rendre muet temporairement',
      '`/unmute` — retirer le mute',
      '`/warn add|list|clear` — gérer les avertissements',
      '`/clear` — supprimer des messages',
      '`/blacklist add|remove|list` — gérer la blacklist',
      '`/note add|list` — notes staff',
      '`/history` — historique d’un membre',
      '`/automod` — paramètres anti-modération',
      '`/scamcheck` — analyser un contenu suspect',
    ].join('\n'),
  },
  tickets: {
    label: 'Tickets',
    emoji: '🎫',
    description: [
      '`/ticket_panel` — publier le panneau de tickets',
      '`/ticket list` — lister les tickets ouverts',
      '`/ticket claim` — prendre un ticket en charge',
      '`/ticket close` — fermer un ticket',
      '`/ticket rename` — renommer un ticket',
      '`/suggest` — envoyer une suggestion',
      '`/poll` — créer un sondage',
    ].join('\n'),
  },
  securite: {
    label: 'Sécurité',
    emoji: '🚨',
    description: [
      '`/security panic` — verrouiller le serveur',
      '`/security status` — état de la sécurité',
      '`/raidmode` — activer/désactiver le raid mode',
      '`/statusrole enable|disable|set|exempt|status|refresh` — rôle selon le statut',
      '`/logs status` — état de la journalisation',
    ].join('\n'),
  },
  utilitaire: {
    label: 'Utilitaire',
    emoji: '⚙️',
    description: [
      '`/config` — centre de configuration unifié',
      '`/embed` — publier un embed',
      '`/rules_panel` — publier le règlement',
      '`/help_panel` — afficher ce panneau',
      '`/stats` — statistiques du serveur',
    ].join('\n'),
  },
};

export function buildHelpPanel() {
  const embed = buildEmbed({
    dark: true,
    title: 'Alln UTILS — Aide',
    description: 'Sélectionne une catégorie pour voir les commandes disponibles.',
    fields: Object.values(HELP_PAGES).map((page) => ({
      name: `${page.emoji} ${page.label}`,
      value: page.description.split('\n').slice(0, 3).join('\n'),
      inline: true,
    })),
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('help_mod').setLabel('Modération').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help_tickets').setLabel('Tickets').setEmoji('🎫').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help_securite').setLabel('Sécurité').setEmoji('🚨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help_utilitaire').setLabel('Utilitaire').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

export function buildHelpPage(pageId) {
  const page = HELP_PAGES[pageId];
  if (!page) return buildHelpPanel();

  const embed = buildEmbed({
    dark: true,
    title: `${page.emoji} ${page.label}`,
    description: page.description,
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('help_home').setLabel('← Aide').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}
