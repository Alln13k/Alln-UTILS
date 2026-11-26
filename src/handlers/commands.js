import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export async function loadCommands(client) {
  const commandsDir = join(process.cwd(), 'src', 'commands');
  for (const file of readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
    const mod = await import(`file:///${join(commandsDir, file).replace(/\\/g, '/')}`);
    const command = mod.default;
    if (command && command.data && typeof command.execute === 'function') {
      client.commands.set(command.data.name, command);
    }
  }
}
