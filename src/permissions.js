import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getConfig } from './config.js';
import { buildError } from './embeds.js';
import { log } from './logger.js';

export function isAdmin(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
}

export function isStaff(member) {
  if (!member) return false;
  if (isAdmin(member)) return true;
  const { staffRoleId } = getConfig();
  const roles = member.roles?.cache;
  if (!roles) return false;
  return Boolean(staffRoleId && roles.has(staffRoleId));
}

export function isTicketStaff(member) {
  if (isStaff(member)) return true;
  const { ticketStaffRoleId } = getConfig();
  const roles = member?.roles?.cache;
  if (!roles) return false;
  return Boolean(ticketStaffRoleId && roles.has(ticketStaffRoleId));
}

export async function requireAdmin(interaction) {
  if (isAdmin(interaction.member)) return true;
  await interaction.reply({
    embeds: [buildError('Commande réservée aux administrateurs.')],
    flags: MessageFlags.Ephemeral,
  }).catch(() => null);
  return false;
}

export async function requireStaff(interaction) {
  if (isStaff(interaction.member)) return true;
  await interaction.reply({
    embeds: [buildError('Commande réservée au staff.')],
    flags: MessageFlags.Ephemeral,
  }).catch(() => null);
  return false;
}

export async function fail(interaction, err, userMessage, scope = 'commande') {
  console.error(`[alln-utils] ${scope}: ${err?.stack ?? err?.message ?? err}`);
  await log(interaction.client, 'errors', 'command', {
    guild: interaction.guild,
    title: `Erreur — ${scope}`,
    description: String(err?.message ?? err ?? 'inconnue').slice(0, 1500),
    fields: [{ name: 'Utilisateur', value: `<@${interaction.user?.id ?? '0'}>`, inline: true }],
  }).catch(() => null);
  return replyError(interaction, userMessage);
}

export async function replyError(interaction, message) {
  const payload = { embeds: [buildError(message)], flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred || interaction.replied) return await interaction.followUp(payload);
    if (interaction.isRepliable?.()) return await interaction.reply(payload);
  } catch (err) {
    console.error(`[alln-utils] réponse d'erreur impossible: ${err.message}`);
  }
  return null;
}
