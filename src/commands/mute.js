import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const DURATION_PATTERN = /^(\d{1,4})\s*(s|m|h|d)$/i;
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

function parseDuration(input) {
  const match = DURATION_PATTERN.exec(input.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const ms = value * UNIT_MS[unit];
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(ms, MAX_TIMEOUT_MS);
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds % 86_400 === 0) return `${seconds / 86_400} jour(s)`;
  if (seconds % 3600 === 0) return `${seconds / 3600} heure(s)`;
  if (seconds % 60 === 0) return `${seconds / 60} minute(s)`;
  return `${seconds} seconde(s)`;
}

export default {
  category: 'Modération',
  description: 'Met un membre en timeout (Discord natif)',
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Met un membre en timeout (Discord natif)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('membre').setDescription('Membre à mute').setRequired(true))
    .addStringOption((opt) => opt.setName('duree').setDescription('Durée : 30s, 10m, 2h, 1d (max 28j)').setRequired(true))
    .addStringOption((opt) => opt.setName('raison').setDescription('Raison du mute').setMaxLength(512).setRequired(false)),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const targetUser = interaction.options.getUser('membre', true);
      const rawDuration = interaction.options.getString('duree', true);
      const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';

      const durationMs = parseDuration(rawDuration);
      if (!durationMs) return replyError(interaction, 'Durée invalide. Formats acceptés : `30s`, `10m`, `2h`, `1d` (max 28 jours).');
      if (targetUser.id === interaction.user.id) return replyError(interaction, 'Tu ne peux pas te mute toi-même.');

      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) return replyError(interaction, 'Ce membre n\'est pas sur le serveur.');
      if (!targetMember.moderatable) return replyError(interaction, 'Ce membre ne peut pas être mute : rôle supérieur ou permissions insuffisantes.');
      if (interaction.member.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
        return replyError(interaction, 'Ton rôle doit être au-dessus de celui du membre ciblé.');
      }

      await targetMember.timeout(durationMs, `${interaction.user.tag} — ${reason}`);
      const formatted = formatDuration(durationMs);

      await log(interaction.client, 'moderation', 'mute', {
        guild: interaction.guild,
        title: 'Mute',
        fields: [
          { name: 'Cible', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
          { name: 'ID', value: targetUser.id, inline: true },
          { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Durée', value: formatted, inline: true },
          { name: 'Action', value: 'mute', inline: true },
          { name: 'Raison', value: reason.slice(0, 1000), inline: false },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Membre mute', description: `<@${targetUser.id}> est en timeout pour **${formatted}**.\n**Raison :** ${reason}` })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Mute impossible. Vérifie mes permissions et la hiérarchie des rôles.', '/mute');
    }
  },
};
