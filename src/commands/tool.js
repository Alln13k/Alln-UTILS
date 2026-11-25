import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getConfig } from '../config.js';
import {
  addTool,
  averageNote,
  editTool,
  findCategory,
  getTool,
  listCategories,
  listTools,
  removeTool,
  listVouchs,
} from '../db.js';
import { buildEmbed } from '../embeds.js';
import { logTo } from '../logging.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

async function notifyToolsChannel(interaction, tool) {
  const config = getConfig();
  if (!config.toolsChannelId) return;
  await logTo(interaction.guild, config.toolsChannelId, {
    embeds: [buildEmbed({
      dark: true,
      title: `Tool — ${tool.name}`,
      description: tool.description,
      fields: [
        { name: 'Catégorie', value: tool.category, inline: true },
        { name: 'Version', value: tool.version ?? 'n/a', inline: true },
        { name: 'Prix', value: tool.price ?? 'n/a', inline: true },
        { name: 'Lien', value: tool.link ?? 'non fourni', inline: false },
      ],
    })],
  });
}

export default {
  category: 'Tools',
  description: 'Gère le catalogue de tools',
  data: new SlashCommandBuilder()
    .setName('tool')
    .setDescription('Gère le catalogue de tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Ajoute une tool')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nom').setMaxLength(60).setRequired(true))
        .addStringOption((opt) => opt.setName('description').setDescription('Description').setMaxLength(500).setRequired(true))
        .addStringOption((opt) => opt.setName('categorie').setDescription('Catégorie (voir /category list)').setRequired(true))
        .addStringOption((opt) => opt.setName('lien').setDescription('Lien').setMaxLength(500).setRequired(false))
        .addStringOption((opt) => opt.setName('version').setDescription('Version').setMaxLength(40).setRequired(false))
        .addStringOption((opt) => opt.setName('prix').setDescription('Prix').setMaxLength(40).setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Supprime une tool')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nom').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les tools par catégorie'))
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('Affiche la fiche complète d\'une tool')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nom').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Modifie une tool')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nom').setRequired(true))
        .addStringOption((opt) => opt.setName('description').setDescription('Nouvelle description').setMaxLength(500).setRequired(false))
        .addStringOption((opt) => opt.setName('categorie').setDescription('Nouvelle catégorie').setRequired(false))
        .addStringOption((opt) => opt.setName('lien').setDescription('Nouveau lien').setMaxLength(500).setRequired(false))
        .addStringOption((opt) => opt.setName('version').setDescription('Nouvelle version').setMaxLength(40).setRequired(false))
        .addStringOption((opt) => opt.setName('prix').setDescription('Nouveau prix').setMaxLength(40).setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('update')
        .setDescription('Marque une tool comme mise à jour et notifie le serveur')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nom de la tool').setRequired(true))
        .addStringOption((opt) => opt.setName('version').setDescription('Nouvelle version').setMaxLength(40).setRequired(true))
        .addStringOption((opt) => opt.setName('changelog').setDescription('Changelog').setMaxLength(1000).setRequired(true)),
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'list') return listCommand(interaction);
      if (sub === 'info') return infoCommand(interaction);

      if (!(await requireStaff(interaction))) return;

      if (sub === 'add') return addCommand(interaction);
      if (sub === 'remove') return removeCommand(interaction);
      if (sub === 'edit') return editCommand(interaction);
      if (sub === 'update') return updateCommand(interaction);

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action tool impossible.', `/tool ${interaction.options.getSubcommand?.() ?? ''}`);
    }
  },
};

async function addCommand(interaction) {
  const name = interaction.options.getString('nom', true).trim();
  const description = interaction.options.getString('description', true).trim();
  const categoryRaw = interaction.options.getString('categorie', true);
  const link = interaction.options.getString('lien');
  const version = interaction.options.getString('version');
  const price = interaction.options.getString('prix');

  const category = findCategory(categoryRaw);
  if (!category) {
    return replyError(interaction, `Catégorie inconnue. Disponibles : ${listCategories().map((c) => c.name).join(', ')}`);
  }

  if (getTool(name)) return replyError(interaction, 'Une tool porte déjà ce nom.');

  const tool = addTool({
    name,
    description,
    category: category.name,
    link,
    version,
    price,
    addedBy: interaction.user.id,
  });

  await notifyToolsChannel(interaction, tool);

  await log(interaction.client, 'tools', 'add', {
    guild: interaction.guild,
    fields: [
      { name: 'Nom', value: tool.name, inline: true },
      { name: 'Catégorie', value: tool.category, inline: true },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return interaction.reply({
    embeds: [buildEmbed({ dark: true, title: 'Tool ajoutée', description: `**${tool.name}** enregistrée dans \`${tool.category}\`.` })],
    flags: MessageFlags.Ephemeral,
  });
}

async function removeCommand(interaction) {
  const name = interaction.options.getString('nom', true);
  const tool = getTool(name);
  if (!tool) return replyError(interaction, 'Tool introuvable.');

  removeTool(name);

  await log(interaction.client, 'tools', 'remove', {
    guild: interaction.guild,
    fields: [
      { name: 'Nom', value: tool.name, inline: true },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return interaction.reply({
    embeds: [buildEmbed({ dark: true, title: 'Tool supprimée', description: `**${tool.name}** a été retirée du catalogue.` })],
    flags: MessageFlags.Ephemeral,
  });
}

async function infoCommand(interaction) {
  const name = interaction.options.getString('nom', true);
  const tool = getTool(name);
  if (!tool) return replyError(interaction, 'Tool introuvable.');

  const avg = averageNote(tool.slug);
  const vouchs = listVouchs(tool.slug);

  return interaction.reply({
    embeds: [buildEmbed({
      dark: true,
      title: tool.name,
      description: tool.description,
      fields: [
        { name: 'Catégorie', value: tool.category, inline: true },
        { name: 'Version', value: tool.version ?? 'n/a', inline: true },
        { name: 'Prix', value: tool.price ?? 'n/a', inline: true },
        { name: 'Lien', value: tool.link ?? 'non fourni', inline: false },
        { name: 'Note moyenne', value: avg ? `⭐ ${avg}/5 (${vouchs.length} vouch(s))` : 'aucun vouch', inline: true },
        { name: 'Ajoutée par', value: `<@${tool.addedBy}>`, inline: true },
        { name: 'Ajoutée le', value: `<t:${Math.floor(new Date(tool.addedAt).getTime() / 1000)}:R>`, inline: true },
      ],
    })],
    flags: MessageFlags.Ephemeral,
  });
}

async function editCommand(interaction) {
  const name = interaction.options.getString('nom', true);
  const tool = getTool(name);
  if (!tool) return replyError(interaction, 'Tool introuvable.');

  const categoryRaw = interaction.options.getString('categorie');
  let category = null;
  if (categoryRaw) {
    const found = findCategory(categoryRaw);
    if (!found) return replyError(interaction, 'Catégorie inconnue.');
    category = found.name;
  }

  const updated = editTool(name, {
    description: interaction.options.getString('description'),
    category,
    link: interaction.options.getString('lien'),
    version: interaction.options.getString('version'),
    price: interaction.options.getString('prix'),
  });

  await log(interaction.client, 'tools', 'edit', {
    guild: interaction.guild,
    fields: [
      { name: 'Nom', value: updated.name, inline: true },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return interaction.reply({
    embeds: [buildEmbed({ dark: true, title: 'Tool modifiée', description: `**${updated.name}** a été mise à jour.` })],
    flags: MessageFlags.Ephemeral,
  });
}

async function listCommand(interaction) {
  const tools = listTools();
  if (tools.length === 0) {
    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Catalogue', description: 'Aucune tool enregistrée.' })],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (tools.length > 10) {
    const sorted = tools.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    const pages = Math.ceil(sorted.length / 10);
    const slice = sorted.slice(0, 10);
    const description = slice
      .map((tool) => `**${tool.name}** \`${tool.category}\` — ${averageNote(tool.slug) ?? '—'}/5`)
      .join('\n');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tools_page:-1').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('tools_page:1').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(pages <= 1),
    );

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: `Catalogue — page 1/${pages}`, description })],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }

  const byCategory = new Map();
  for (const tool of tools) {
    const list = byCategory.get(tool.category) ?? [];
    list.push(tool);
    byCategory.set(tool.category, list);
  }

  const fields = [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({
      name: category,
      value: list.map((t) => `**${t.name}**${t.version ? ` v${t.version}` : ''} — ${averageNote(t.slug) ?? '—'}/5`).join('\n').slice(0, 1024),
      inline: false,
    }));

  return interaction.reply({
    embeds: [buildEmbed({ dark: true, title: `Catalogue — ${tools.length} tool(s)`, fields: fields.slice(0, 25) })],
    flags: MessageFlags.Ephemeral,
  });
}

async function updateCommand(interaction) {
  const name = interaction.options.getString('nom', true);
  const version = interaction.options.getString('version', true).trim();
  const changelog = interaction.options.getString('changelog', true).trim();

  const tool = getTool(name);
  if (!tool) return replyError(interaction, 'Tool introuvable.');

  const updated = editTool(name, { version, changelog, lastUpdateBy: interaction.user.id });
  const config = getConfig();
  const pingRoles = [config.vouchRoleId, config.staffRoleId].filter(Boolean);
  const content = pingRoles.length ? pingRoles.map((id) => `<@&${id}>`).join(' ') : undefined;

  if (config.toolsChannelId) {
    await logTo(interaction.guild, config.toolsChannelId, {
      content,
      allowedMentions: { roles: pingRoles },
      embeds: [buildEmbed({
        dark: true,
        title: `Mise à jour — ${updated.name} v${version}`,
        description: changelog,
        fields: [
          { name: 'Tool', value: updated.name, inline: true },
          { name: 'Version', value: version, inline: true },
          { name: 'Lien', value: updated.link ?? 'non fourni', inline: false },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        ],
      })],
    });
  }

  await log(interaction.client, 'tools', 'update', {
    guild: interaction.guild,
    fields: [
      { name: 'Tool', value: updated.name, inline: true },
      { name: 'Version', value: version, inline: true },
      { name: 'Changelog', value: changelog.slice(0, 800), inline: false },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return interaction.reply({
    embeds: [buildEmbed({
      dark: true,
      title: 'Mise à jour publiée',
      description: `**${updated.name}** est maintenant en version **${version}**.`,
    })],
    flags: MessageFlags.Ephemeral,
  });
}
