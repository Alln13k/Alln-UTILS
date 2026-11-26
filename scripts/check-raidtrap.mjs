import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = (name) => pathToFileURL(path.join(ROOT, 'src', name)).href;
const configFile = path.join(ROOT, 'data', 'config.json');
const backup = fs.existsSync(configFile) ? fs.readFileSync(configFile) : null;

class Collection extends Map {
  filter(fn) {
    const out = new Collection();
    for (const [key, value] of this) if (fn(value, key)) out.set(key, value);
    return out;
  }
}

const CHANNEL_ID = '123456789012345671';
const WHITELIST_ID = '123456789012345672';

function makeMessage({ content = 'raid', channelId = CHANNEL_ID, whitelisted = false } = {}) {
  const calls = { kicked: [], deleted: 0, purged: 0, channelDeleted: 0 };
  const roles = new Map();
  if (whitelisted) roles.set(WHITELIST_ID, { id: WHITELIST_ID });

  const member = {
    id: '123456789012345680',
    roles: { cache: roles },
    kickable: true,
    kick: async (reason) => { calls.kicked.push(reason); },
  };
  const textChannel = {
    id: CHANNEL_ID,
    isTextBased: () => true,
    isThread: () => false,
    delete: async () => { calls.channelDeleted += 1; },
    messages: {
      fetch: async () => new Collection(),
      bulkDelete: async () => { calls.purged += 1; return new Collection(); },
    },
  };
  const guild = {
    id: '123456789012345660',
    channels: { cache: new Collection([[CHANNEL_ID, textChannel]]), fetch: async () => null },
    members: {
      fetch: async () => member,
      ban: async () => { throw new Error('ban ne doit pas être appelé'); },
    },
  };
  const message = {
    id: '123456789012345690',
    guild,
    channelId,
    content,
    author: { id: member.id, bot: false, tag: 'user#0001', username: 'user' },
    createdTimestamp: Date.now(),
    deleted: false,
    delete: async () => { calls.deleted += 1; message.deleted = true; },
  };
  return { message, calls };
}

const problems = [];
try {
  const { setConfigValue } = await import(url('config.js'));
  const { handleRaidTrap } = await import(url('services/raidtrap.js'));
  const client = { user: { id: 'bot' } };

  await setConfigValue('raidTrapEnabled', true);
  await setConfigValue('raidTrapChannelId', CHANNEL_ID);
  await setConfigValue('raidTrapBanReason', 'raid trap');
  await setConfigValue('raidTrapWhitelist', []);

  let ctx = makeMessage();
  let handled = await handleRaidTrap(client, ctx.message);
  if (handled !== true || ctx.calls.kicked.length !== 1 || ctx.calls.deleted !== 1) {
    problems.push('message dans le salon piège: message non supprimé ou membre non kické');
  } else {
    console.log('[ok] message dans le salon texte -> message supprimé + kick');
  }
  if (ctx.calls.channelDeleted || ctx.calls.purged) {
    problems.push('le salon ou d’autres messages ont été supprimés');
  } else {
    console.log('[ok] salon intact, aucune purge supplémentaire');
  }

  ctx = makeMessage({ channelId: '123456789012345677' });
  handled = await handleRaidTrap(client, ctx.message);
  if (handled || ctx.calls.kicked.length) problems.push('autre salon: le piège ne doit pas se déclencher');
  else console.log('[ok] autre salon -> aucun déclenchement');

  await setConfigValue('raidTrapWhitelist', [WHITELIST_ID]);
  ctx = makeMessage({ whitelisted: true });
  handled = await handleRaidTrap(client, ctx.message);
  if (handled || ctx.calls.kicked.length) problems.push('rôle whitelisté: le piège ne doit pas se déclencher');
  else console.log('[ok] rôle whitelisté -> aucun déclenchement');
} finally {
  if (backup === null) {
    if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
  } else {
    fs.writeFileSync(configFile, backup);
  }
}

if (problems.length) {
  console.error(`\n${problems.length} problème(s):\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('\nPiège à raid texte (delete message + kick) validé.');
}
