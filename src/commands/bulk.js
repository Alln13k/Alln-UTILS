import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

const pending = new Map();

function parseIds(raw) {
  const ids = new Set();
  for (const match of String(raw).matchAll(/<@!?(\d{15,25})>|(\d{15,25})/g)) {
    ids.add(match[1] ?? match[2]);
  }
  return [...ids].slice(0, 25);
}

function cleanup(token) {
  setTimeout(() => pending.delete(token), 5 * 60 * 1000).unref?.();
}

export default {
  category: 'Modération',
  description: 'Actions de modération en masse avec confirmation',
  data: new SlashCommandBuilder()
    .setName('bulk')
    .setDescription('Actions de modération en masse avec confirmation')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('ban')
        .setDescription('Ban plusieurs membres')
        .addStringOption((opt) => opt.setName('users').setDescription('Mentions ou IDs séparés par des espaces').setMaxLength(1000).setRequired(true))
        .addStringOption((opt) => opt.setName('raison').setDescription('Raison').setMaxLength(400).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unban')
        .setDescription('Unban plusieurs IDs')
        .addStringOption((opt) => opt.setName('ids').setDescription('IDs séparés par des espaces').setMaxLength(1000).setRequired(true)),
    ),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;
      const sub = interaction.options.getSubcommand();
      const action = sub === 'ban' ? 'ban' : 'unban';
      const raw = action === 'ban'
        ? interaction.options.getString('users', true)
        : interaction.options.getString('ids', true);
      const ids = parseIds(raw);

      if (ids.length === 0) return replyError(interaction, 'Aucun utilisateur valide détecté.');
      const reason = action === 'ban'
        ? interaction.options.getString('raison', true).trim()
        : 'Unban en masse';

      const token = randomUUID();
      pending.set(token, { action, ids, reason, guildId: interaction.guild.id, by: interaction.user.id });
      cleanup(token);

      const list = ids.map((id) => `<@${id}>`).join(', ');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`bulk_confirm:${token}`)
          .setLabel('Confirmer')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`bulk_cancel:${token}`)
          .setLabel('Annuler')
          .setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: `Confirmation — ${action} en masse`,
          description: `${ids.length} utilisateur(s) ciblé(s) : ${list}`,
          fields: [{ name: 'Raison', value: reason.slice(0, 800), inline: false }],
        })],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Commande de masse impossible.', '/bulk');
    }
  },
};

export async function executeBulk(interaction, token) {
  const job = pending.get(token);
  if (!job) return replyError(interaction, 'Action expirée. Relance la commande.');
  if (job.guildId !== interaction.guild.id) return replyError(interaction, 'Action invalide pour ce serveur.');
  if (job.by !== interaction.user.id) return replyError(interaction, 'Seul l\'auteur de la commande peut confirmer.');
  pending.delete(token);

  const results = [];
  for (const id of job.ids) {
    let status = 'ok';
    try {
      if (job.action === 'ban') {
        await interaction.guild.members.ban(id, { reason: job.reason });
      } else {
        await interaction.guild.members.unban(id, job.reason);
      }
    } catch (err) {
      status = `échec: ${err.message}`;
    }
    results.push({ id, status });

    await log(interaction.client, 'bulk', job.action, {
      guild: interaction.guild,
      fields: [
        { name: 'Utilisateur', value: `<@${id}> (${id})`, inline: true },
        { name: 'Raison', value: job.reason.slice(0, 500), inline: false },
        { name: 'Résultat', value: status.slice(0, 300), inline: true },
        { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
      ],
    });
  }

  const okCount = results.filter((result) => result.status === 'ok').length;
  const description = results
    .map((result) => `<@${result.id}> — ${result.status}`)
    .join('\n')
    .slice(0, 3900);

  if (interaction.isButton && interaction.isButton()) {
    return interaction.update({
      embeds: [buildEmbed({
        dark: true,
        title: `${job.action === 'ban' ? 'Ban' : 'Unban'} en masse terminé`,
        description: `${okCount}/${results.length} action(s) réussie(s).\n\n${description}`,
      })],
      components: [],
    }).catch(() => null);
  }

  return interaction.reply({
    embeds: [buildEmbed({
      dark: true,
      title: `${job.action === 'ban' ? 'Ban' : 'Unban'} en masse terminé`,
      description: `${okCount}/${results.length} action(s) réussie(s).\n\n${description}`,
    })],
    flags: MessageFlags.Ephemeral,
  });
}

export function cancelBulk(interaction, token) {
  pending.delete(token);
  return interaction.update({
    embeds: [buildEmbed({ dark: true, title: 'Action annulée', description: 'Aucune action n\'a été effectuée.' })],
    components: [],
  }).catch(() => null);
}
