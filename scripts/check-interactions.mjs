import fs from 'node:fs';
import path from 'node:path';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DATA = join(ROOT, 'data');
const url = (name) => pathToFileURL(join(SRC, name)).href;

// Sauvegarde robuste : on restaure le contenu initial, ou on supprime le fichier
// s'il n'existait pas avant le test. La restauration est garantie dans le finally.
const backups = new Map();
for (const name of ['config', 'suggestions']) {
  const file = join(DATA, `${name}.json`);
  backups.set(name, fs.existsSync(file) ? fs.readFileSync(file) : null);
}

function restore() {
  for (const [name, content] of backups) {
    const file = join(DATA, `${name}.json`);
    if (content === null) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } else {
      fs.writeFileSync(file, content);
    }
  }
}

function makeInteraction({
  customId = 'x',
  kind = 'button',
  values = [],
  fieldValues = {},
  userId = 'admin1',
  channelId = 'c1',
} = {}) {
  const calls = [];
  const guild = {
    id: 'g1',
    roles: {
      everyone: { id: 'everyone' },
      cache: new Map([['123456789012345678', { id: '123456789012345678' }]]),
      fetch: async () => null,
    },
    members: { cache: new Map(), fetch: async () => new Map(), me: { voice: { channelId: null } } },
    memberCount: 42,
    channels: {
      cache: new Map(),
      fetch: async () => null,
    },
  };
  const member = {
    id: userId,
    user: { id: userId, tag: 'admin#0001', username: 'admin' },
    permissions: { has: () => true },
    roles: { cache: new Map(), add: async () => {}, remove: async () => {} },
    voice: { channelId: null },
    kickable: true,
  };

  const interaction = {
    customId,
    type: kind === 'button' ? 2 : kind === 'select' ? 3 : 5,
    user: member.user,
    userId,
    guildId: guild.id,
    guild,
    member,
    channelId,
    channel: {
      id: channelId,
      guild,
      isTextBased: () => true,
      isThread: () => false,
      permissionOverwrites: {
        cache: new Map(),
        edit: async () => {},
        create: async () => {},
        delete: async () => {},
      },
      setName: async () => {},
      send: async () => ({ id: 'm1', url: 'https://discord.com/m1' }),
      messages: { fetch: async () => ({ reactions: { cache: new Map() } }) },
    },
    message: {
      id: 'source-msg',
      interaction: { user: { id: userId } },
    },
    values,
    fields: { getTextInputValue: (id) => fieldValues[id] ?? '' },
    options: {
      getSubcommand: () => 'status',
      getString: () => null,
      getInteger: () => null,
      getBoolean: () => null,
      getChannel: () => null,
      getUser: () => null,
      getMember: () => null,
      getRole: () => null,
    },
    client: { user: { id: 'bot' }, guilds: { cache: new Map() } },
    deferred: false,
    replied: false,
    isRepliable: () => true,
    isMessageComponent: () => kind === 'button' || kind === 'select',
    isModalSubmit: () => kind === 'modal',
    isAnySelectMenu: () => kind === 'select',
    isButton: () => kind === 'button',
    async reply(payload) {
      calls.push(['reply', payload]);
      this.replied = true;
      return { id: 'reply-msg' };
    },
    async deferReply(options) {
      calls.push(['deferReply', options]);
      this.deferred = true;
    },
    async update(payload) {
      if (this.deferred || this.replied) throw new Error('InteractionAlreadyReplied');
      calls.push(['update', payload]);
      this.replied = true;
      return { id: 'source-msg' };
    },
    async editReply(payload) {
      calls.push(['editReply', payload]);
      return {};
    },
    async followUp(payload) {
      calls.push(['followUp', payload]);
      return {};
    },
    async showModal(modal) {
      if (this.deferred || this.replied) throw new Error('InteractionAlreadyReplied');
      calls.push(['showModal', modal.toJSON()]);
      this.replied = true;
    },
  };
  return { interaction, calls };
}

const cases = [
  ['config:main', 'button', {}, []],
  ['config:refresh:main', 'button', {}, []],
  ['config:open:general', 'button', {}, []],
  ['config:refresh:general', 'button', {}, []],
  ['config:toggle:membercount:memberCountIncludeBots', 'button', {}, []],
  ['config:reset:general:footer', 'button', {}, []],
  ['config:modal:general:footer', 'button', {}, []],
  ['config:cat', 'select', { values: ['general'] }, []],
  ['config:pick:general', 'select', { values: ['footer'] }, []],
  ['config:set:notifications:suggestionsChannelId', 'select', { values: ['123456789012345678'] }, []],
  ['config:modal:general:footer', 'modal', {}, { value: 'Test footer' }],
  ['help_mod', 'button', {}, []],
  ['help_home', 'button', {}, []],
  ['ticket_open', 'button', {}, []],
  ['ticket_category', 'select', { values: ['support'] }, []],
  ['ticket_modal:support', 'modal', {}, { ticket_subject: 'Sujet', ticket_description: 'Description' }],
  ['ticket_rename_modal', 'modal', {}, { ticket_new_name: 'test' }],
  ['rules_accept', 'button', {}, []],
  ['suggest_vote:up:9999', 'button', {}, []],
  ['tickets_page:0', 'button', {}, []],
  ['unknown_action', 'button', {}, []],
];

const problems = [];

try {
  const { handleButton } = await import(url('handlers/buttons.js'));
  const { handleSelect } = await import(url('handlers/selects.js'));
  const { handleModal } = await import(url('handlers/modals.js'));
  const { ensureResponded } = await import(url('respond.js'));
  const { createConfigSession } = await import(url('systems/config/ConfigSessions.js'));
  const { setConfigValue } = await import(url('config.js'));
  const { saveSuggestion } = await import(url('db.js'));

  saveSuggestion({
    id: 9999,
    guildId: 'g1',
    channelId: 'c1',
    userId: 'someone',
    text: 'test',
    status: 'pending',
    votes: { up: [], down: [] },
  });

  await setConfigValue('ticketCategoryId', null);
  await setConfigValue('logChannelId', null);
  await setConfigValue('verifiedRoleId', '123456789012345678');

  for (const [customId, kind, extra, fieldValues] of cases) {
    const { interaction, calls } = makeInteraction({ customId, kind, ...extra, fieldValues });
    createConfigSession(interaction.message.id, interaction.user.id);

    let handler;
    if (kind === 'button') handler = handleButton;
    else if (kind === 'select') handler = handleSelect;
    else handler = handleModal;

    try {
      await handler(interaction);
      await ensureResponded(interaction);
    } catch (err) {
      problems.push(`${customId} (${kind}): exception ${err.message}`);
      continue;
    }

    const acknowledgements = calls.filter(([name]) =>
      ['reply', 'deferReply', 'update', 'showModal'].includes(name));
    if (acknowledgements.length === 0) {
      problems.push(`${customId} (${kind}): aucune accusé de réception`);
    }
    if (acknowledgements.length > 1) {
      problems.push(`${customId} (${kind}): ${acknowledgements.length} accusés`);
    }
    console.log(`[ok] ${customId} (${kind}) -> ${calls.map(([name]) => name).join(', ')}`);
  }
} finally {
  restore();
}

if (problems.length) {
  console.error(`\n${problems.length} problème(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('\nTous les chemins d’interaction ont été accusés exactement une fois.');
}
