import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = path.join(HERE, '..', 'commands');

export async function loadCommands(client) {
  const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.js'));
  client.commands.clear();

  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(COMMANDS_DIR, file)).href);
    const command = mod.default;

    if (!command?.data || typeof command.execute !== 'function') {
      console.warn(`[alln-utils] commande ignorée (format invalide): ${file}`);
      continue;
    }

    client.commands.set(command.data.name, command);
  }

  console.log(`[alln-utils] ${client.commands.size} commande(s) chargée(s)`);
}
