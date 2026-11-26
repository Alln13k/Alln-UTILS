import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = (name) => pathToFileURL(path.join(ROOT, 'src', name)).href;
const configFile = path.join(ROOT, 'data', 'config.json');
const backup = fs.existsSync(configFile) ? fs.readFileSync(configFile) : null;

const ROLE_ID = '123456789012345671';
const EXEMPT_ID = '123456789012345672';

let memberSeq = 0;
function makeMember({ admin = true, hasRole = false, state = null, exempt = false } = {}) {
  const userId = String(123456789012345680n + BigInt(memberSeq++));
  const added = [];
  const removed = [];
  const roles = new Map([
    [ROLE_ID, { id: ROLE_ID, name: 'Statut', position: 1, managed: false }],
    ['123456789012345670', { id: '123456789012345670', name: '@everyone', position: 0, managed: false }],
  ]);
  const memberRoles = new Map();
  if (hasRole) memberRoles.set(ROLE_ID, roles.get(ROLE_ID));
  if (exempt) memberRoles.set(EXEMPT_ID, { id: EXEMPT_ID, name: 'Exempt', position: 9 });

  const guild = {
    id: '123456789012345660',
    name: 'Test',
    roles: {
      cache: roles,
      everyone: { id: '123456789012345670' },
      fetch: async (id) => roles.get(id) ?? null,
    },
    members: {
      me: { roles: { highest: { id: '123456789012345669', name: 'Bot', position: 5 } } },
      fetch: async () => new Map(),
      fetchMe: async () => ({ roles: { highest: { id: '123456789012345669', name: 'Bot', position: 5 } } }),
    },
    channels: { fetch: async () => null },
  };
  const member = {
    id: userId,
    guild,
    user: { id: userId, tag: 'user#0001', bot: false },
    permissions: { has: () => admin },
    roles: {
      cache: memberRoles,
      add: async (id) => { added.push(id); memberRoles.set(id, roles.get(id)); },
      remove: async (id) => { removed.push(id); memberRoles.delete(id); },
    },
    presence: state === null ? null : { activities: [{ type: 4, state }] },
  };
  guild.members.cache = new Map([[member.id, member]]);
  return { member, guild, added, removed };
}

const problems = [];
try {
  const { setConfigValue } = await import(url('config.js'));
  const { applyForMember, statusRoleDiagnostics } = await import(url('services/statusRole.js'));

  await setConfigValue('statusRoleEnabled', true);
  await setConfigValue('statusRoleText', 'test');
  await setConfigValue('statusRoleId', ROLE_ID);
  await setConfigValue('statusRoleMatchMode', 'contains');
  await setConfigValue('statusRoleExemptRoleIds', []);
  await setConfigValue('statusRoleLogChanges', false);

  const client = { user: { id: 'bot' } };

  let ctx = makeMember({ admin: true, state: 'hello TEST world' });
  await applyForMember(client, ctx.member);
  if (ctx.added[0] !== ROLE_ID) problems.push('admin avec statut correspondant: rôle non attribué');
  else console.log('[ok] admin avec statut correspondant -> rôle attribué');

  ctx = makeMember({ admin: true, hasRole: true, state: 'autre chose' });
  await applyForMember(client, ctx.member);
  if (ctx.removed[0] !== ROLE_ID) problems.push('admin sans correspondance: rôle non retiré');
  else console.log('[ok] admin sans correspondance -> rôle retiré');

  await setConfigValue('statusRoleExemptRoleIds', [EXEMPT_ID]);
  ctx = makeMember({ admin: true, exempt: true, state: 'hello TEST world' });
  await applyForMember(client, ctx.member);
  if (ctx.added.length) problems.push('rôle exempté: attribution alors qu’il ne devrait pas');
  else console.log('[ok] rôle exempté -> aucun attribut');

  await setConfigValue('statusRoleExemptRoleIds', []);
  await setConfigValue('statusRoleMatchMode', 'exact');
  ctx = makeMember({ admin: true, state: 'exact' });
  await applyForMember(client, ctx.member);
  if (ctx.added.length) problems.push('mode exact: correspondance erronée');
  else console.log('[ok] mode exact -> aucun attribut pour "hello TEST world"');

  await setConfigValue('statusRoleMatchMode', 'contains');
  ctx = makeMember({ admin: true, hasRole: true, state: 'hello TEST world' });
  const diag = statusRoleDiagnostics(ctx.guild);
  if (!diag.enabled || !diag.canAssign || diag.matching !== 1) {
    problems.push(`diagnostics invalides: ${JSON.stringify(diag)}`);
  } else {
    console.log(`[ok] diagnostics -> rôle attribuable=${diag.canAssign}, correspondances=${diag.matching}`);
  }
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
  console.log('\nWatcher statut validé.');
}
