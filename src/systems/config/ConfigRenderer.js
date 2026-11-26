import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
} from 'discord.js';
import { CONFIG_KEYS, getConfig } from '../../config.js';
import { buildEmbed } from '../../embeds.js';
import {
  CONFIG_CATEGORIES,
  categoryById,
  keysForCategory,
  channelTypesFor,
  displayValue,
  valuePreview,
  typeIcon,
  typeLabel,
  constraintsText,
  isDefaultValue,
  isListType,
  isSelectType,
  isModalType,
} from './ConfigRegistry.js';

function navRow(categoryId = null) {
  const row = new ActionRowBuilder();
  if (categoryId) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`config:open:${categoryId}`)
        .setLabel('← Catégorie')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('config:main')
      .setLabel(categoryId ? '🏠 Menu' : '← Menu')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(categoryId ? `config:refresh:${categoryId}` : 'config:refresh:main')
      .setLabel('🔄 Actualiser')
      .setStyle(ButtonStyle.Secondary),
  );
  return row;
}

function errorPayload(message) {
  return {
    embeds: [buildEmbed({ dark: true, title: 'Configuration', description: message })],
    components: [navRow()],
  };
}

export function buildConfigMainMenu() {
  const config = getConfig();
  const fields = CONFIG_CATEGORIES.map((category) => {
    const keys = keysForCategory(category.id);
    const configured = keys.filter((key) => {
      const value = config[key];
      return value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
    }).length;
    return {
      name: `${category.emoji} ${category.label}`,
      value: `${category.description}\n\`${configured}/${keys.length}\` réglage(s) configuré(s)`,
      inline: true,
    };
  });

  const embed = buildEmbed({
    dark: true,
    title: '⚙️ Configuration Center',
    description: 'Sélectionne une catégorie pour configurer le bot. Chaque modification est enregistrée immédiatement.',
    fields,
    footer: 'Alln UTILS // Configuration Center',
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('config:cat')
    .setPlaceholder('Choisis une catégorie')
    .addOptions(
      CONFIG_CATEGORIES.slice(0, 25).map((category) => ({
        label: category.label.slice(0, 100),
        value: category.id,
        description: category.description.slice(0, 100),
        emoji: category.emoji,
      })),
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('config:refresh:main')
          .setLabel('🔄 Actualiser')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export function buildConfigCategory(categoryId) {
  const category = categoryById(categoryId);
  if (!category) return errorPayload('Catégorie inconnue.');

  const config = getConfig();
  const keys = keysForCategory(categoryId);
  const fields = keys.map((key) => {
    const meta = CONFIG_KEYS[key];
    return {
      name: `${typeIcon(key)} ${meta.label}`.slice(0, 256),
      value: `${displayValue(key, config[key])}\n\`${key}\``.slice(0, 1024),
      inline: false,
    };
  });

  if (fields.length === 0) {
    fields.push({ name: 'Aucun réglage', value: 'Cette catégorie ne contient aucune option configurable.', inline: false });
  }

  const embed = buildEmbed({
    dark: true,
    title: `${category.emoji} ${category.label}`,
    description: `${category.description}\nChoisis un réglage dans le menu ou utilise les boutons rapides.`,
    fields,
    footer: 'Alln UTILS // Configuration Center',
  });

  const components = [];

  const boolKeys = keys.filter((key) => CONFIG_KEYS[key].type === 'bool').slice(0, 5);
  if (boolKeys.length > 0) {
    const row = new ActionRowBuilder();
    for (const key of boolKeys) {
      const enabled = Boolean(config[key]);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`config:toggle:${categoryId}:${key}`)
          .setLabel(`${enabled ? '✅' : '❌'} ${CONFIG_KEYS[key].label}`.slice(0, 80))
          .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Danger),
      );
    }
    components.push(row);
  }

  if (keys.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`config:pick:${categoryId}`)
      .setPlaceholder('Modifier un réglage…')
      .addOptions(
        keys.slice(0, 25).map((key) => ({
          label: `${typeIcon(key)} ${CONFIG_KEYS[key].label}`.slice(0, 100),
          value: key,
          description: valuePreview(key, config[key]),
        })),
      );
    components.push(new ActionRowBuilder().addComponents(menu));
  }

  components.push(navRow(categoryId));
  return { embeds: [embed], components: components.slice(0, 5) };
}

export function buildConfigEditor(categoryId, key) {
  const category = categoryById(categoryId);
  const meta = CONFIG_KEYS[key];
  if (!category || !meta) return errorPayload('Réglage inconnu.');

  const config = getConfig();
  const current = config[key];

  const embed = buildEmbed({
    dark: true,
    title: `${typeIcon(key)} ${meta.label}`,
    description: `Modifie **${meta.label}** dans la catégorie **${category.label}**.`,
    fields: [
      { name: 'Valeur actuelle', value: displayValue(key, current).slice(0, 1024), inline: false },
      { name: 'Type', value: typeLabel(key), inline: true },
      { name: 'Contraintes', value: constraintsText(key).slice(0, 1024), inline: true },
      { name: 'Clé', value: `\`${key}\``, inline: true },
      { name: 'Valeur par défaut', value: displayValue(key, meta.default).slice(0, 1024), inline: false },
    ],
    footer: 'Alln UTILS // Configuration Center',
  });

  const editorRow = new ActionRowBuilder();

  if (meta.type === 'bool') {
    editorRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`config:toggle:${categoryId}:${key}`)
        .setLabel(current ? '🔴 Désactiver' : '🟢 Activer')
        .setStyle(current ? ButtonStyle.Danger : ButtonStyle.Success),
    );
  } else if (isSelectType(meta.type)) {
    const list = isListType(meta.type);
    const customId = `config:set:${categoryId}:${key}`;
    const placeholder = `Sélectionner ${meta.label}`.slice(0, 150);
    const types = channelTypesFor(key);

    if (meta.type === 'channel' || meta.type === 'channelList') {
      const select = new ChannelSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .setMinValues(1)
        .setMaxValues(list ? 25 : 1);
      if (types?.length) select.setChannelTypes(...types);
      editorRow.addComponents(select);
    } else {
      editorRow.addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(customId)
          .setPlaceholder(placeholder)
          .setMinValues(1)
          .setMaxValues(list ? 25 : 1),
      );
    }
  } else if (isModalType(meta.type)) {
    editorRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`config:modal:${categoryId}:${key}`)
        .setLabel('✏️ Modifier')
        .setStyle(ButtonStyle.Primary),
    );
  } else {
    editorRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`config:modal:${categoryId}:${key}`)
        .setLabel('✏️ Modifier')
        .setStyle(ButtonStyle.Primary),
    );
  }

  const actions = new ActionRowBuilder();
  if (!isDefaultValue(key, current)) {
    actions.addComponents(
      new ButtonBuilder()
        .setCustomId(`config:reset:${categoryId}:${key}`)
        .setLabel('↩️ Défaut')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  actions.addComponents(
    new ButtonBuilder()
      .setCustomId(`config:open:${categoryId}`)
      .setLabel('← Catégorie')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('config:main')
      .setLabel('🏠 Menu')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`config:refresh:${categoryId}:${key}`)
      .setLabel('🔄 Actualiser')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [editorRow, actions] };
}
