import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = (name) => pathToFileURL(path.join(ROOT, 'src', name)).href;
const configFile = path.join(ROOT, 'data', 'config.json');
const backup = fs.existsSync(configFile) ? fs.readFileSync(configFile) : null;

const CHANNEL_ID = '123456789012345671';
const MEMBER_ID = '123456789012345680';

function makeMember({ bot = false } = {}) {
  return {
    id: MEMBER_ID,
    displayName: 'Test',
    user: { id: MEMBER_ID, username: 'testuser', tag: 'testuser#0001', bot },
    guild: {
      name: 'Serveur Test',
      memberCount: 42,
      channels: { fetch: async () => null },
    },
  };
}

const problems = [];
try {
  const { configKeyList, getConfig, setConfigValue } = await import(url('config.js'));
  const { sendWelcomeMessage, renderWelcomeMessage } = await import(url('services/welcome.js'));
  const { categoryById } = await import(url('systems/config/ConfigRegistry.js'));

  for (const key of ['welcomeChannelId', 'welcomeEnabled', 'welcomeMessage']) {
    if (!configKeyList().includes(key)) problems.push(`clé de config manquante: ${key}`);
    if (!categoryById('notifications').keys.includes(key)) problems.push(`clé absente de /config: ${key}`);
  }

  const payloads = [];
  const channel = {
    id: CHANNEL_ID,
    isTextBased: () => true,
    send: async (payload) => { payloads.push(payload); },
  };
  const client = { user: { id: 'bot' } };

  await setConfigValue('welcomeEnabled', false);
  let handled = await sendWelcomeMessage(client, makeMember(), channel);
  if (handled || payloads.length) problems.push('watcher désactivé: un message a été envoyé');
  else console.log('[ok] désactivé -> aucun message');

  await setConfigValue('welcomeEnabled', true);
  await setConfigValue('welcomeChannelId', CHANNEL_ID);
  await setConfigValue(
    'welcomeMessage',
    'Bienvenue {mention} ({user} / {username}) sur {guild} ! {count} membres.',
  );

  handled = await sendWelcomeMessage(client, makeMember(), channel);
  const payload = payloads[0];
  if (!handled || payloads.length !== 1) {
    problems.push('membre humain: message non envoyé');
  } else {
    console.log('[ok] membre humain -> message envoyé');
  }
  if (payload?.embeds !== undefined) problems.push('un embed a été joint au message de bienvenue');
  else console.log('[ok] aucun embed dans le message');
  if (!payload?.content?.includes(`<@${MEMBER_ID}>`)
      || !payload.content.includes('Serveur Test')
      || !payload.content.includes('testuser')
      || !payload.content.includes('42')) {
    problems.push(`placeholders non remplacés: ${payload?.content}`);
  } else {
    console.log('[ok] placeholders {mention} {user} {username} {guild} {count} remplacés');
  }
  if (!payload?.allowedMentions?.users?.includes(MEMBER_ID)) {
    problems.push('mention du nouveau membre non autorisée');
  } else {
    console.log('[ok] seule la mention du nouveau membre est autorisée');
  }

  handled = await sendWelcomeMessage(client, makeMember({ bot: true }), channel);
  if (handled || payloads.length !== 1) problems.push('bot: un message de bienvenue a été envoyé');
  else console.log('[ok] bot -> aucun message');

  const rendered = renderWelcomeMessage('Salut {server} — {count}', makeMember(), makeMember().guild);
  if (rendered !== 'Salut Serveur Test — 42') problems.push(`rendu invalide: ${rendered}`);
  else console.log('[ok] rendu direct du template correct');

  if (getConfig().welcomeMessage === '') problems.push('template vide inattendu');
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
  console.log('\nSystème de bienvenue texte validé.');
}
