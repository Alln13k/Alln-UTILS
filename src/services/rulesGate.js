import { getConfig } from '../config.js';
import { log } from '../logger.js';

export async function applyUnverifiedRole(member) {
  const config = getConfig();
  if (!config.unverifiedRoleId || !member?.roles) return false;

  const role = member.guild.roles.cache.get(config.unverifiedRoleId)
    ?? (await member.guild.roles.fetch(config.unverifiedRoleId).catch(() => null));
  if (!role) return false;

  await member.roles.add(role, 'Vérification du règlement en attente').catch(() => null);
  return true;
}

export async function acceptRules(client, member, guild) {
  const config = getConfig();
  if (!config.verifiedRoleId) return { ok: false, reason: 'Aucun rôle vérifié configuré (`verifiedRoleId`).' };

  const verified = guild.roles.cache.get(config.verifiedRoleId)
    ?? (await guild.roles.fetch(config.verifiedRoleId).catch(() => null));
  if (!verified) return { ok: false, reason: 'Rôle vérifié introuvable.' };

  if (config.unverifiedRoleId) {
    await member.roles.remove(config.unverifiedRoleId, 'Règlement accepté').catch(() => null);
  }
  await member.roles.add(config.verifiedRoleId, 'Règlement accepté').catch(() => null);

  await log(client, 'rules', 'accept', {
    guild,
    fields: [
      { name: 'Membre', value: `<@${member.id}> (${member.user.tag})`, inline: true },
      { name: 'Rôle', value: `<@&${config.verifiedRoleId}>`, inline: true },
    ],
  });

  return { ok: true };
}

export async function revokeRules(client, member, guild) {
  const config = getConfig();
  if (!config.verifiedRoleId) return { ok: false, reason: 'Aucun rôle vérifié configuré.' };

  await member.roles.remove(config.verifiedRoleId, 'Vérification retirée').catch(() => null);

  if (config.unverifiedRoleId) {
    await member.roles.add(config.unverifiedRoleId, 'Vérification retirée').catch(() => null);
  }

  await log(client, 'rules', 'revoke', {
    guild,
    fields: [
      { name: 'Membre', value: `<@${member.id}>`, inline: true },
      { name: 'Par', value: `<@${client.user.id}>`, inline: true },
    ],
  });

  return { ok: true };
}

export async function acceptNsfw(client, member, guild) {
  const config = getConfig();
  if (!config.nsfwRoleId) return { ok: false, reason: 'Aucun rôle NSFW configuré (`nsfwRoleId`).' };

  const role = guild.roles.cache.get(config.nsfwRoleId)
    ?? (await guild.roles.fetch(config.nsfwRoleId).catch(() => null));
  if (!role) return { ok: false, reason: 'Rôle NSFW introuvable.' };

  await member.roles.add(config.nsfwRoleId, 'Vérification NSFW').catch(() => null);

  await log(client, 'nsfw', 'accept', {
    guild,
    fields: [
      { name: 'Membre', value: `<@${member.id}> (${member.user.tag})`, inline: true },
      { name: 'Rôle', value: `<@&${config.nsfwRoleId}>`, inline: true },
    ],
  });

  return { ok: true };
}

export async function revokeNsfw(client, member, guild) {
  const config = getConfig();
  if (!config.nsfwRoleId) return { ok: false, reason: 'Aucun rôle NSFW configuré.' };

  await member.roles.remove(config.nsfwRoleId, 'Accès NSFW retiré').catch(() => null);

  await log(client, 'nsfw', 'revoke', {
    guild,
    fields: [
      { name: 'Membre', value: `<@${member.id}>`, inline: true },
      { name: 'Rôle', value: `<@&${config.nsfwRoleId}>`, inline: true },
    ],
  });

  return { ok: true };
}
