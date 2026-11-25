import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = path.join(HERE, '..', 'src', 'commands');

const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.js'));
let failures = 0;

for (const file of files) {
  try {
    const mod = await import(pathToFileURL(path.join(COMMANDS_DIR, file)).href);
    const command = mod.default;

    if (!command?.data || typeof command.execute !== 'function') {
      throw new Error('export default incomplet (data/execute)');
    }

    const json = command.data.toJSON();
    if (!json.name || !json.description) throw new Error('nom ou description manquant');

    const names = (json.options ?? []).map((o) => o.name);
    if (new Set(names).size !== names.length) throw new Error('options dupliquées');

    console.log(`OK    ${json.name} (${json.options?.length ?? 0} option(s))`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  ${file} -> ${err.message}`);
  }
}

console.log(`\n${files.length - failures}/${files.length} commande(s) valide(s)`);
process.exit(failures === 0 ? 0 : 1);
