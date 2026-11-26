import { readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

function validatePayload(label, payload, { requireEmbed = true } = {}) {
  if (!payload) return fail(`${label}: payload vide`);
  if (requireEmbed && (!Array.isArray(payload.embeds) || payload.embeds.length === 0)) {
    fail(`${label}: aucun embed`);
  }
  if (!Array.isArray(payload.components)) return;
  if (payload.components.length > 5) fail(`${label}: ${payload.components.length} lignes (max 5)`);

  for (const [rowIndex, row] of payload.components.entries()) {
    const components = row?.components ?? [];
    if (components.length > 5) fail(`${label} ligne ${rowIndex}: ${components.length} composants (max 5)`);
    const selects = components.filter((c) => c.type >= 3 && c.type <= 7);
    if (selects.length > 1) fail(`${label} ligne ${rowIndex}: ${selects.length} selects (max 1)`);

    for (const component of components) {
      const data = typeof component.toJSON === 'function' ? component.toJSON() : component;
      if (data.type === 2) {
        if (!data.custom_id) fail(`${label}: bouton sans customId`);
        if (data.custom_id.length > 100) fail(`${label}: customId trop long (${data.custom_id.length})`);
        if (data.label && data.label.length > 80) fail(`${label}: label bouton trop long`);
      }
      if (data.type >= 3 && data.type <= 7) {
        if (!data.custom_id) fail(`${label}: select sans customId`);
        if (data.custom_id.length > 100) fail(`${label}: customId select trop long (${data.custom_id.length})`);
        if (data.options && data.options.length > 25) fail(`${label}: ${data.options.length} options (max 25)`);
        for (const option of data.options ?? []) {
          if (!option.value || option.value.length > 100) fail(`${label}: option invalide ${JSON.stringify(option.value)}`);
          if (option.description && option.description.length > 100) fail(`${label}: description option trop longue`);
        }
      }
    }
  }
}

async function main() {
  const files = walk(SRC).filter((file) => !file.endsWith('index.js'));
  for (const file of files) {
    try {
      await import(pathToFileURL(file).href);
    } catch (err) {
      fail(`import ${relative(ROOT, file)}: ${err.message}`);
    }
  }
  notes.push(`${files.length} modules importés`);

  const { configKeyList } = await import(pathToFileURL(join(SRC, 'config.js')).href);
  const registry = await import(pathToFileURL(join(SRC, 'systems/config/ConfigRegistry.js')).href);
  const renderer = await import(pathToFileURL(join(SRC, 'systems/config/ConfigRenderer.js')).href);
  const helpUi = await import(pathToFileURL(join(SRC, 'helpUi.js')).href);
  const ticketUi = await import(pathToFileURL(join(SRC, 'ticketUi.js')).href);
  const buttons = await import(pathToFileURL(join(SRC, 'handlers/buttons.js')).href);
  const suggestionUi = await import(pathToFileURL(join(SRC, 'suggestionUi.js')).href);
  const ticketForms = await import(pathToFileURL(join(SRC, 'ticketForms.js')).href);

  const unmapped = registry.unmappedConfigKeys();
  const orphans = registry.orphanCategoryKeys();
  if (unmapped.length) fail(`clés non exposées dans /config: ${unmapped.join(', ')}`);
  if (orphans.length) fail(`clés de catégorie inconnues: ${orphans.join(', ')}`);
  notes.push(`${configKeyList().length} clés de configuration exposées`);

  const commands = [];
  for (const file of files.filter((path) => path.includes(join('src', 'commands')))) {
    const mod = await import(pathToFileURL(file).href);
    const command = mod.default;
    if (!command?.data || typeof command.execute !== 'function') {
      fail(`${relative(ROOT, file)}: commande invalide`);
      continue;
    }
    try {
      const json = command.data.toJSON();
      if (!json.name) fail(`${relative(ROOT, file)}: nom manquant`);
      commands.push(json);
    } catch (err) {
      fail(`${relative(ROOT, file)}: toJSON: ${err.message}`);
    }
  }
  if (commands.length !== 25) fail(`${commands.length} commandes (attendu 25)`);
  notes.push(`${commands.length} commandes chargées`);

  validatePayload('config.main', renderer.buildConfigMainMenu());
  for (const category of registry.CONFIG_CATEGORIES) {
    validatePayload(`config.category.${category.id}`, renderer.buildConfigCategory(category.id));
    for (const key of category.keys) {
      validatePayload(`config.editor.${key}`, renderer.buildConfigEditor(category.id, key));
    }
  }

  validatePayload('help.panel', helpUi.buildHelpPanel());
  for (const page of Object.keys(helpUi.HELP_PAGES)) {
    validatePayload(`help.${page}`, helpUi.buildHelpPage(page));
  }

  validatePayload('ticket.panel', { embeds: [], components: buttons.buildTicketPanelComponents() }, { requireEmbed: false });
  validatePayload('ticket.row', { embeds: [], components: [ticketUi.buildTicketRow({ status: 'open' })] }, { requireEmbed: false });
  validatePayload('suggestion', suggestionUi.buildSuggestionPayload({
    id: 1, text: 'test', userId: '123', status: 'pending', votes: { up: [], down: [] },
  }));

  const modal = ticketForms.buildTicketModal('support').toJSON();
  if (!modal.custom_id?.startsWith('ticket_modal:')) fail('ticket modal customId invalide');
  if (modal.components.length > 5) fail('ticket modal: trop de lignes');

  const channelSelect = renderer.buildConfigEditor('membercount', 'memberCountChannelId')
    .components[0].components[0].toJSON();
  if (!Array.isArray(channelSelect.channel_types) || !channelSelect.channel_types.includes(2)) {
    fail(`memberCountChannelId: sélecteur vocal manquant (${JSON.stringify(channelSelect.channel_types)})`);
  } else {
    notes.push(`memberCountChannelId channel_types = ${channelSelect.channel_types.join(',')}`);
  }

  const customIds = new Set();
  for (const category of registry.CONFIG_CATEGORIES) {
    for (const payload of [
      renderer.buildConfigCategory(category.id),
      ...category.keys.map((key) => renderer.buildConfigEditor(category.id, key)),
    ]) {
      for (const row of payload.components) {
        for (const component of row.components) {
          const data = component.toJSON();
          if (data.custom_id) customIds.add(data.custom_id.split(':')[1] ?? data.custom_id);
        }
      }
    }
  }
  const allowed = new Set([
    'main', 'open', 'refresh', 'toggle', 'reset', 'modal', 'cat', 'pick', 'set',
    'config', 'help_mod', 'help_tickets', 'help_securite', 'help_utilitaire', 'help_home',
    'rules_accept', 'ticket_open', 'ticket_claim', 'ticket_close', 'ticket_rename',
    'ticket_add', 'ticket_remove', 'ticket_category', 'suggest_vote',
  ]);
  for (const id of customIds) {
    if (!allowed.has(id)) fail(`customId non routé: ${id}`);
  }
  notes.push(`${customIds.size} préfixes de customId vérifiés`);

  console.log(notes.map((line) => `[ok] ${line}`).join('\n'));
  if (problems.length) {
    console.error(`\n${problems.length} problème(s):`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('Validation des composants terminée sans erreur.');
  }
}

main().catch((err) => {
  console.error(err.stack ?? err.message);
  process.exitCode = 1;
});
