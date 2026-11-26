import { MessageFlags } from 'discord.js';
import { buildError } from './embeds.js';
import { log } from './logger.js';

function withoutFlags(payload = {}) {
  const { flags, ...rest } = payload;
  return rest;
}

export async function safeReply(interaction, payload = {}) {
  try {
    if (interaction.deferred) return await interaction.editReply(withoutFlags(payload));
    if (interaction.replied) return await interaction.followUp(payload);
    if (interaction.isRepliable?.()) return await interaction.reply(payload);
  } catch (err) {
    console.error(`[alln-utils] safeReply ${interaction.customId ?? interaction.commandName ?? '?'}: ${err.message}`);
  }
  return null;
}

export async function safeUpdate(interaction, payload = {}) {
  try {
    if (interaction.deferred || interaction.replied) return await interaction.editReply(withoutFlags(payload));
    if (interaction.isMessageComponent?.() || interaction.isModalSubmit?.()) return await interaction.update(payload);
    return await safeReply(interaction, payload);
  } catch (err) {
    console.error(`[alln-utils] safeUpdate ${interaction.customId ?? '?'}: ${err.message}`);
  }
  return null;
}

export async function safeError(interaction, message = 'Une erreur est survenue. Réessaie dans un instant.') {
  const embed = buildError(message);
  try {
    if (interaction.deferred) return await interaction.editReply({ embeds: [embed] });
    if (interaction.replied) {
      return await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    if (interaction.isRepliable?.()) {
      return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error(`[alln-utils] safeError ${interaction.customId ?? interaction.commandName ?? '?'}: ${err.message}`);
  }
  return null;
}

export async function safeDefer(interaction, options = {}) {
  try {
    if (interaction.deferred || interaction.replied) return true;
    if (!interaction.isRepliable?.()) return false;
    await interaction.deferReply(options);
    return true;
  } catch (err) {
    console.error(`[alln-utils] deferReply ${interaction.customId ?? interaction.commandName ?? '?'}: ${err.message}`);
    return false;
  }
}

export async function safeShowModal(interaction, modal) {
  try {
    if (interaction.deferred || interaction.replied) {
      await safeError(interaction, 'Cette action a déjà été traitée.');
      return false;
    }
    await interaction.showModal(modal);
    return true;
  } catch (err) {
    console.error(`[alln-utils] showModal ${interaction.customId ?? '?'}: ${err.message}`);
    await safeError(interaction, 'Impossible d’ouvrir le formulaire. Réessaie.');
    return false;
  }
}

export function ensureResponded(interaction) {
  if (interaction.replied || interaction.deferred) return null;
  return safeError(interaction, 'Action non reconnue.');
}

export async function logInteractionError(client, interaction, err) {
  const customId = interaction.customId ?? interaction.commandName ?? 'n/a';
  console.error(
    `[alln-utils] interaction ${customId} (type ${interaction.type ?? '?'}, guild ${interaction.guildId ?? 'dm'}, user ${interaction.user?.id ?? '?'})`,
    err,
  );

  await log(client, 'errors', 'interaction', {
    guild: interaction.guild ?? null,
    description: `${err.name ?? 'Error'}: ${err.message ?? String(err)}`.slice(0, 1500),
    fields: [
      { name: 'Type', value: String(interaction.type ?? 'inconnu'), inline: true },
      { name: 'Custom ID', value: String(customId).slice(0, 1000), inline: true },
      { name: 'Guild', value: String(interaction.guildId ?? 'DM'), inline: true },
      { name: 'Utilisateur', value: `<@${interaction.user?.id ?? '0'}>`, inline: true },
      { name: 'Stack', value: String(err.stack ?? err.message ?? err).slice(0, 1000), inline: false },
    ],
  }).catch(() => null);
}
