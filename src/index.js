import 'dotenv/config';
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import { getConfig } from './config.js';
import { initDb } from './db.js';
import { ensureResponded, logInteractionError, safeError } from './respond.js';
import { loadCommands } from './handlers/commands.js';
import { handleButton } from './handlers/buttons.js';
import { handleSelect } from './handlers/selects.js';
import { handleModal } from './handlers/modals.js';
import { startStatusRoleService } from './services/statusRole.js';
import { handleRaidTrap } from './services/raidtrap.js';
import { startMemberCountService } from './services/membercount.js';
import { handleAutomod } from './services/automod.js';
import { handleNewAccountLink, handleSecurityJoin } from './services/security.js';
import { applyUnverifiedRole } from './services/rulesGate.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],
});

client.commands = new Collection();

function startServices() {
  // Chaque service est idempotent et lit la configuration à chaque exécution :
  // les modifications de /config prennent effet sans redémarrage.
  startStatusRoleService(client);
  startMemberCountService(client).catch((err) => {
    console.error(`[alln-utils] démarrage compteur membres: ${err.stack ?? err.message}`);
  });
}

client.once(Events.ClientReady, async () => {
  console.log(`[alln-utils] Connecté en tant que ${client.user.tag}`);
  initDb();
  try {
    await loadCommands(client);
  } catch (err) {
    console.error(`[alln-utils] chargement commandes: ${err.stack ?? err.message}`);
  }
  startServices();
});

// --- Routeur d'interactions unique -----------------------------------------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return safeError(interaction, 'Commande inconnue.');
      await command.execute(interaction);
      await ensureResponded(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      await ensureResponded(interaction);
      return;
    }

    if (interaction.isAnySelectMenu()) {
      await handleSelect(interaction);
      await ensureResponded(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      await ensureResponded(interaction);
      return;
    }

    // Autres types d'interaction : on accuse réception pour éviter les timeouts.
    await ensureResponded(interaction);
  } catch (err) {
    await logInteractionError(client, interaction, err);
    try {
      await safeError(
        interaction,
        '❌ Something went wrong while processing this action. Please try again.',
      );
    } catch (replyErr) {
      console.error(`[alln-utils] réponse erreur: ${replyErr.message}`);
    }
  }
});

// --- Événements serveur -----------------------------------------------------
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const config = getConfig();
    if (config.autoroleId) {
      await member.roles.add(config.autoroleId, 'Autorole').catch(() => null);
    }
    if (config.rulesChannelId || config.unverifiedRoleId) {
      await applyUnverifiedRole(member);
    }
    await handleSecurityJoin(client, member);
  } catch (err) {
    console.error(`[alln-utils] guildMemberAdd ${member.id}: ${err.stack ?? err.message}`);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author?.bot || message.system) return;
  try {
    const securityHandled = await handleNewAccountLink(client, message);
    if (securityHandled || message.deleted) return;
    if (await handleRaidTrap(client, message)) return;
    await handleAutomod(client, message);
  } catch (err) {
    console.error(`[alln-utils] messageCreate ${message.id}: ${err.stack ?? err.message}`);
  }
});

client.on(Events.Error, (err) => {
  console.error(`[alln-utils] client error: ${err.stack ?? err.message}`);
});

process.on('unhandledRejection', (err) => {
  console.error(`[alln-utils] unhandledRejection: ${err?.stack ?? err}`);
});

process.on('uncaughtException', (err) => {
  console.error(`[alln-utils] uncaughtException: ${err?.stack ?? err}`);
});

if (!process.env.DISCORD_TOKEN) {
  console.error('[alln-utils] DISCORD_TOKEN manquant dans .env');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('[alln-utils] login failed:', err.stack ?? err.message);
  process.exit(1);
});
