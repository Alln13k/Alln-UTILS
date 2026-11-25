import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildEmbed } from './embeds.js';

const STATUS_LABEL = {
  pending: '⏳ En attente',
  accepted: '✅ Acceptée',
  denied: '❌ Refusée',
};

export function buildSuggestionEmbed(suggestion) {
  const up = suggestion.votes?.up?.length ?? 0;
  const down = suggestion.votes?.down?.length ?? 0;
  const total = up + down;
  const ratio = total > 0 ? Math.round((up / total) * 100) : 0;

  return buildEmbed({
    dark: true,
    title: `💡 Suggestion #${suggestion.id}`,
    description: suggestion.text,
    fields: [
      { name: 'Statut', value: STATUS_LABEL[suggestion.status] ?? suggestion.status, inline: true },
      { name: 'Auteur', value: `<@${suggestion.userId}>`, inline: true },
      { name: 'Votes', value: `👍 ${up} — 👎 ${down} (${ratio}% positif)`, inline: false },
    ],
  });
}

export function buildSuggestionRow(suggestion) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`suggest_vote:up:${suggestion.id}`)
      .setLabel(String(suggestion.votes?.up?.length ?? 0))
      .setEmoji('👍')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(suggestion.status && suggestion.status !== 'pending')),
    new ButtonBuilder()
      .setCustomId(`suggest_vote:down:${suggestion.id}`)
      .setLabel(String(suggestion.votes?.down?.length ?? 0))
      .setEmoji('👎')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(suggestion.status && suggestion.status !== 'pending')),
    new ButtonBuilder()
      .setCustomId(`suggest_comment:${suggestion.id}`)
      .setLabel('Commenter')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(suggestion.status && suggestion.status !== 'pending')),
  );
}

export function buildSuggestionPayload(suggestion) {
  return {
    embeds: [buildSuggestionEmbed(suggestion)],
    components: [buildSuggestionRow(suggestion)],
  };
}
