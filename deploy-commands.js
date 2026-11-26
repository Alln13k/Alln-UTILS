import { REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('[alln-utils] DISCORD_TOKEN, CLIENT_ID et GUILD_ID requis dans .env');
  process.exit(1);
}

const commands = [];
const commandsDir = join(process.cwd(), 'src', 'commands');

for (const file of readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const mod = await import(`file:///${join(commandsDir, file).replace(/\\/g, '/')}`);
  const command = mod.default;
  if (command && command.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
  .then(() => console.log(`[alln-utils] ${commands.length} commande(s) enregistrée(s) sur la guilde ${GUILD_ID}`))
  .catch((err) => console.error('[alln-utils] deploy error:', err));
