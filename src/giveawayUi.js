import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { listGiveaways } from './db.js';
import { buildEmbed } from './embeds.js';

const LIST_PER_PAGE = 5;

export function conditionsLines(conditions = {}) {
  const lines = [];
  if (conditions.roleId) lines.push(`Rôle requis : <@&${conditions.roleId}>`);
  if (conditions.premiumRequired) lines.push('Compte premium requis');
  if (conditions.levelRequired) lines.push(`Niveau minimum : **${conditions.levelRequired}**`);
  if (conditions.vouchRequired) lines.push(`Vouchs minimum : **${conditions.vouchRequired}**`);
  if (conditions.minAccountDays) lines.push(`Compte créé depuis au moins **${conditions.minAccountDays}** jour(s)`);
  return lines.length ? lines.join('\n') : 'Aucune condition particulière.';
}

export function buildGiveawayEmbed(giveaway) {
  const endsAt = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
  const fields = [
    { name: 'Gagnants', value: String(giveaway.winnerCount ?? 1), inline: true },
    { name: 'Participants', value: String((giveaway.participants ?? []).length), inline: true },
    { name: 'Hôte', value: `<@${giveaway.hostId}>`, inline: true },
    { name: 'Fin', value: giveaway.ended ? 'terminé' : `<t:${endsAt}:F> (<t:${endsAt}:R>)`, inline: false },
    { name: 'Conditions', value: conditionsLines(giveaway.conditions), inline: false },
  ];

  if (giveaway.ended) {
    fields.unshift({
      name: 'Résultat',
      value: giveaway.winners?.length ? giveaway.winners.map((id) => `<@${id}>`).join(', ') : 'aucun gagnant',
      inline: false,
    });
  }

  return buildEmbed({
    dark: true,
    title: `🎁 ${giveaway.prize}`,
    description: giveaway.description || 'Participe pour tenter ta chance.',
    fields,
  });
}

export function buildGiveawayRow(giveaway) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_join:${giveaway.id}`)
      .setLabel(giveaway.ended ? 'Terminé' : 'Participer')
      .setEmoji('🎉')
      .setStyle(giveaway.ended ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(Boolean(giveaway.ended)),
  );
}

export function buildGiveawayPayload(giveaway) {
  return {
    embeds: [buildGiveawayEmbed(giveaway)],
    components: [buildGiveawayRow(giveaway)],
  };
}

export function buildGiveawayListPage(page = 0) {
  const active = listGiveaways(true).sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
  const pages = Math.max(1, Math.ceil(active.length / LIST_PER_PAGE));
  const current = Math.min(Math.max(Number(page) || 0, 0), pages - 1);
  const slice = active.slice(current * LIST_PER_PAGE, current * LIST_PER_PAGE + LIST_PER_PAGE);

  const description = slice.length
    ? slice.map((giveaway) => {
      const endsAt = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
      return `**#${giveaway.id} — ${giveaway.prize}**\n<#${giveaway.channelId}> · ${giveaway.participants?.length ?? 0} participant(s) · fin <t:${endsAt}:R>`;
    }).join('\n\n')
    : 'Aucun giveaway actif.';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_list_page:${current - 1}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current === 0),
    new ButtonBuilder()
      .setCustomId(`giveaway_list_page:${current + 1}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current >= pages - 1),
  );

  return {
    embeds: [buildEmbed({ dark: true, title: `Giveaways actifs — page ${current + 1}/${pages}`, description })],
    components: [row],
  };
}
