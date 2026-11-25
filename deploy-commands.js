import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = path.join(HERE, 'src', 'commands');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('[alln-utils] DISCORD_TOKEN, CLIENT_ID et GUILD_ID doivent être définis dans .env');
  process.exit(1);
}

const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.js'));
const body = [];

for (const file of files) {
  const mod = await import(pathToFileURL(path.join(COMMANDS_DIR, file)).href);
  const command = mod.default;

  if (!command?.data) {
    console.warn(`[alln-utils] ignoré: ${file}`);
    continue;
  }

  body.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

try {
  const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
  console.log(`[alln-utils] ${data.length} commande(s) enregistrée(s) sur la guilde ${guildId}`);
} catch (err) {
  console.error(`[alln-utils] déploiement échoué: ${err.message}`);
  process.exit(1);
}
