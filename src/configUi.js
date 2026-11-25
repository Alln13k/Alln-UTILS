import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import { configKeyList, getConfig } from './config.js';
import { displayConfigValue } from './configParse.js';
import { buildEmbed } from './embeds.js';
import { countActiveLogs, logCategories, logEventsFor } from './logger.js';

const CONFIG_PER_PAGE = 8;
const LOG_EVENTS_PER_PAGE = 10;

export function buildConfigPage(page = 0) {
  const config = getConfig();
  const keys = configKeyList();
  const pages = Math.max(1, Math.ceil(keys.length / CONFIG_PER_PAGE));
  const current = Math.min(Math.max(Number(page) || 0, 0), pages - 1);
  const slice = keys.slice(current * CONFIG_PER_PAGE, current * CONFIG_PER_PAGE + CONFIG_PER_PAGE);

  const fields = slice.map((key) => ({
    name: key,
    value: displayConfigValue(key, config[key], { prettyJson: true }).slice(0, 1024),
    inline: key.length < 22,
  }));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`config_page:${current - 1}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current === 0),
    new ButtonBuilder()
      .setCustomId(`config_page:${current + 1}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current >= pages - 1),
    new ButtonBuilder()
      .setCustomId('config_logs_menu')
      .setLabel('Logs')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
  );

  return {
    embeds: [buildEmbed({ dark: true, title: `Configuration — page ${current + 1}/${pages}`, fields })],
    components: [row],
  };
}

export function buildLogsMenu() {
  const categories = logCategories();
  const options = categories.slice(0, 25).map((category) => {
    const { active, total } = countActiveLogs(category);
    return {
      label: category,
      value: category,
      description: `${active}/${total} événement(s) actif(s)`,
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('logs_category')
    .setPlaceholder('Choisis une catégorie de logs')
    .addOptions(options);

  const lines = categories.map((category) => {
    const { active, total } = countActiveLogs(category);
    return `**${category}** — ${active}/${total}`;
  });

  return {
    embeds: [buildEmbed({
      dark: true,
      title: 'Logs — catégories',
      description: lines.join('\n') || 'Aucune catégorie.',
      fields: [{ name: 'Astuce', value: 'Sélectionne une catégorie pour activer/désactiver chaque événement en direct.' }],
    })],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

export function buildLogsCategory(category) {
  const events = logEventsFor(category);
  if (!events) {
    return {
      embeds: [buildEmbed({ dark: true, title: 'Logs', description: 'Catégorie inconnue.' })],
      components: [],
    };
  }

  const entries = Object.entries(events);
  const lines = entries.map(([event, enabled]) => `${enabled === false ? '❌' : '✅'} **${event}**`);
  const active = entries.filter(([, enabled]) => enabled !== false).length;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`logs_event:${category}`)
    .setPlaceholder('Sélectionne un événement à basculer')
    .addOptions(entries.slice(0, 25).map(([event, enabled]) => ({
      label: event,
      value: event,
      description: enabled === false ? 'désactivé — cliquer pour activer' : 'actif — cliquer pour désactiver',
      emoji: enabled === false ? '❌' : '✅',
    })));

  return {
    embeds: [buildEmbed({
      dark: true,
      title: `Logs — ${category}`,
      description: lines.join('\n'),
      fields: [{ name: 'Actifs', value: `${active}/${entries.length}`, inline: true }],
    })],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

export function buildLogsEventsPage(category, page = 0) {
  const events = logEventsFor(category);
  if (!events) {
    return {
      embeds: [buildEmbed({ dark: true, title: 'Logs', description: 'Catégorie inconnue.' })],
      components: [],
    };
  }

  const entries = Object.entries(events);
  const pages = Math.max(1, Math.ceil(entries.length / LOG_EVENTS_PER_PAGE));
  const current = Math.min(Math.max(Number(page) || 0, 0), pages - 1);
  const slice = entries.slice(current * LOG_EVENTS_PER_PAGE, current * LOG_EVENTS_PER_PAGE + LOG_EVENTS_PER_PAGE);

  const lines = slice.map(([event, enabled]) => `${enabled === false ? '❌' : '✅'} **${category}.${event}**`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`logs_events_page:${category}:${current - 1}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current === 0),
    new ButtonBuilder()
      .setCustomId(`logs_events_page:${category}:${current + 1}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current >= pages - 1),
  );

  return {
    embeds: [buildEmbed({
      dark: true,
      title: `Logs — ${category} (${current + 1}/${pages})`,
      description: lines.join('\n'),
    })],
    components: [row],
  };
}

export function buildLogsStatus(overrides = {}) {
  const config = getConfig();
  const { active, total } = countActiveLogs();
  const overrideLines = Object.entries(overrides);

  return {
    embeds: [buildEmbed({
      dark: true,
      title: 'Logs — état global',
      fields: [
        { name: 'Salon principal', value: config.logChannelId ? `<#${config.logChannelId}>` : 'non défini', inline: true },
        { name: 'Événements actifs', value: `${active}/${total}`, inline: true },
        { name: 'Salons exclus', value: (config.logExcludedChannels ?? []).length ? config.logExcludedChannels.map((id) => `<#${id}>`).join(', ') : 'aucun', inline: false },
        {
          name: 'Overrides',
          value: overrideLines.length
            ? overrideLines.map(([key, channelId]) => `\`${key}\` → <#${channelId}>`).join('\n').slice(0, 1024)
            : 'aucun',
          inline: false,
        },
      ],
    })],
  };
}
