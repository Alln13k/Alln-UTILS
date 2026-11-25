import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { buildEmbed } from './embeds.js';

function bar(count, total, size = 12) {
  if (total <= 0) return '░'.repeat(size);
  const filled = Math.round((count / total) * size);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, size - filled))}`;
}

export function buildPollEmbed(poll) {
  const total = poll.options.reduce((sum, option) => sum + (option.votes?.length ?? 0), 0);
  const anonymous = Boolean(poll.anonymous);

  const lines = poll.options.map((option, index) => {
    const votes = option.votes?.length ?? 0;
    const percent = total > 0 ? Math.round((votes / total) * 100) : 0;
    const line = `**${index + 1}. ${option.text}**\n${bar(votes, total)} ${votes} vote(s) — ${percent}%`;
    if (!anonymous && votes > 0) {
      return `${line}\n${option.votes.slice(0, 10).map((id) => `<@${id}>`).join(', ')}`;
    }
    return line;
  });

  return buildEmbed({
    dark: true,
    title: `📊 ${poll.question}`,
    description: lines.join('\n\n').slice(0, 4000),
    fields: [
      { name: 'Statut', value: poll.ended ? 'Clôturé' : 'En cours', inline: true },
      { name: 'Votes totaux', value: String(total), inline: true },
      { name: 'Mode', value: anonymous ? 'Anonyme' : 'Public', inline: true },
      { name: 'Auteur', value: `<@${poll.userId}>`, inline: true },
    ],
  });
}

export function buildPollComponents(poll) {
  if (poll.ended) return [];

  if (poll.options.length <= 5) {
    const row = new ActionRowBuilder().addComponents(
      poll.options.map((option, index) => new ButtonBuilder()
        .setCustomId(`poll_vote:${poll.id}:${index}`)
        .setLabel(option.text.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)),
    );
    return [row];
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`poll_select:${poll.id}`)
    .setPlaceholder('Choisis une option')
    .addOptions(poll.options.slice(0, 25).map((option, index) => ({
      label: option.text.slice(0, 100),
      value: String(index),
      description: `${option.votes?.length ?? 0} vote(s)`,
    })));

  return [new ActionRowBuilder().addComponents(menu)];
}

export function buildPollPayload(poll) {
  return {
    embeds: [buildPollEmbed(poll)],
    components: buildPollComponents(poll),
  };
}
