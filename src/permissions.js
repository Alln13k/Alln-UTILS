import { PermissionFlagsBits } from 'discord.js';
import { getConfig } from './config.js';
import { safeError } from './respond.js';

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
  await safeError(interaction, 'Commande réservée aux administrateurs.');
  return false;
}

export async function requireStaff(interaction) {
  if (isStaff(interaction.member)) return true;
  await safeError(interaction, 'Commande réservée au staff.');
  return false;
}

export async function requireTicketStaff(interaction) {
  if (isTicketStaff(interaction.member)) return true;
  await safeError(interaction, 'Commande réservée au staff tickets.');
  return false;
}

export async function replyError(interaction, message) {
  return safeError(interaction, message);
}
