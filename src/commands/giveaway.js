import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  deleteGiveaway,
  getGiveaway,
  listGiveaways,
  nextGiveawayId,
  saveGiveaway,
} from '../db.js';
import { buildEmbed } from '../embeds.js';
import { buildGiveawayListPage, buildGiveawayPayload } from '../giveawayUi.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';
import { parseDuration } from '../duration.js';
import { endGiveaway, rerollGiveaway, scheduleGiveaway } from '../services/giveaways.js';

export default {
  category: 'Giveaways',
  description: 'Gère les giveaways du serveur',
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Gère les giveaways du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Lance un giveaway')
        .addStringOption((opt) => opt.setName('prix').setDescription('Prix à gagner').setMaxLength(200).setRequired(true))
        .addStringOption((opt) => opt.setName('duree').setDescription('Durée : 1h, 1d, 3d ou date ISO').setRequired(true))
        .addStringOption((opt) => opt.setName('description').setDescription('Description').setMaxLength(1500).setRequired(false))
        .addIntegerOption((opt) => opt.setName('gagnants').setDescription('Nombre de gagnants').setMinValue(1).setMaxValue(50).setRequired(false))
        .addRoleOption((opt) => opt.setName('role').setDescription('Rôle requis').setRequired(false))
        .addChannelOption((opt) => opt.setName('salon').setDescription('Salon cible').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addIntegerOption((opt) => opt.setName('niveau').setDescription('Niveau minimum requis').setMinValue(0).setMaxValue(1000).setRequired(false))
        .addBooleanOption((opt) => opt.setName('premium').setDescription('Premium requis').setRequired(false))
        .addIntegerOption((opt) => opt.setName('vouchs').setDescription('Vouchs minimum requis').setMinValue(0).setMaxValue(100).setRequired(false))
        .addIntegerOption((opt) => opt.setName('compte_age').setDescription('Âge minimum du compte (jours)').setMinValue(0).setMaxValue(365).setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub.setName('end').setDescription('Termine un giveaway').addIntegerOption((opt) => opt.setName('id').setDescription('ID du giveaway').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName('reroll').setDescription('Tire un nouveau gagnant').addIntegerOption((opt) => opt.setName('id').setDescription('ID du giveaway').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les giveaways actifs'))
    .addSubcommand((sub) =>
      sub.setName('delete').setDescription('Supprime un giveaway').addIntegerOption((opt) => opt.setName('id').setDescription('ID du giveaway').setRequired(true)),
    ),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;
      const sub = interaction.options.getSubcommand();

      if (sub === 'start') return startGiveaway(interaction);
      if (sub === 'list') return interaction.reply({ ...buildGiveawayListPage(0), flags: MessageFlags.Ephemeral });
      if (sub === 'end') return endCommand(interaction);
      if (sub === 'reroll') return rerollCommand(interaction);
      if (sub === 'delete') return deleteCommand(interaction);
      return null;
    } catch (err) {
      return fail(interaction, err, 'Action giveaway impossible.', '/giveaway');
    }
  },
};

async function startGiveaway(interaction) {
  const prize = interaction.options.getString('prix', true).trim();
  const rawDuration = interaction.options.getString('duree', true);
  const durationMs = parseDuration(rawDuration);
  if (!durationMs || durationMs < 10_000) {
    return replyError(interaction, 'Durée invalide. Utilise `1h`, `1d`, `3d` ou une date ISO future.');
  }

  const endsAtMs = /^\d{4}-\d{2}-\d{2}/.test(rawDuration) ? durationMs : Date.now() + durationMs;
  if (endsAtMs <= Date.now()) return replyError(interaction, 'La date de fin doit être dans le futur.');

  const target = interaction.options.getChannel('salon') ?? interaction.channel;
  if (!target?.isTextBased()) return replyError(interaction, 'Salon cible invalide.');

  const id = nextGiveawayId();
  const giveaway = {
    id,
    guildId: interaction.guild.id,
    channelId: target.id,
    messageId: null,
    prize,
    description: interaction.options.getString('description') ?? '',
    winnerCount: interaction.options.getInteger('gagnants') ?? 1,
    endsAt: new Date(endsAtMs).toISOString(),
    hostId: interaction.user.id,
    participants: [],
    conditions: {
      roleId: interaction.options.getRole('role')?.id ?? null,
      premiumRequired: interaction.options.getBoolean('premium') ?? false,
      levelRequired: interaction.options.getInteger('niveau') ?? 0,
      vouchRequired: interaction.options.getInteger('vouchs') ?? 0,
      minAccountDays: interaction.options.getInteger('compte_age') ?? 0,
    },
    ended: false,
    winners: [],
    createdAt: new Date().toISOString(),
  };

  const message = await target.send(buildGiveawayPayload(giveaway));
  giveaway.messageId = message.id;
  saveGiveaway(giveaway);
  scheduleGiveaway(interaction.client, giveaway);

  await log(interaction.client, 'giveaways', 'start', {
    guild: interaction.guild,
    fields: [
      { name: 'Prix', value: prize, inline: true },
      { name: 'Gagnants', value: String(giveaway.winnerCount), inline: true },
      { name: 'Fin', value: `<t:${Math.floor(endsAtMs / 1000)}:F>`, inline: true },
      { name: 'Salon', value: `<#${target.id}>`, inline: true },
      { name: 'Hôte', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return interaction.reply({
    embeds: [buildEmbed({
      dark: true,
      title: 'Giveaway lancé',
      description: `**${prize}** — ID \`#${id}\` dans <#${target.id}>.`,
      fields: [{ name: 'Fin', value: `<t:${Math.floor(endsAtMs / 1000)}:R>`, inline: true }],
    })],
    flags: MessageFlags.Ephemeral,
  });
}

async function endCommand(interaction) {
  const id = interaction.options.getInteger('id', true);
  const giveaway = getGiveaway(id);
  if (!giveaway) return replyError(interaction, 'Giveaway introuvable.');

  const result = await endGiveaway(interaction.client, id);
  if (!result.ok) return replyError(interaction, result.error);

  return interaction.reply({
    embeds: [buildEmbed({
      dark: true,
      title: 'Giveaway terminé',
      description: result.winners.length
        ? `Gagnant(s) : ${result.winners.map((userId) => `<@${userId}>`).join(', ')}`
        : 'Aucun participant valide.',
    })],
    flags: MessageFlags.Ephemeral,
  });
}

async function rerollCommand(interaction) {
  const id = interaction.options.getInteger('id', true);
  const result = await rerollGiveaway(interaction.client, id);
  if (!result.ok) return replyError(interaction, result.error);

  return interaction.reply({
    embeds: [buildEmbed({
      dark: true,
      title: 'Reroll effectué',
      description: `Nouveau gagnant : ${result.winners.map((userId) => `<@${userId}>`).join(', ')}`,
    })],
    flags: MessageFlags.Ephemeral,
  });
}

async function deleteCommand(interaction) {
  const id = interaction.options.getInteger('id', true);
  const giveaway = getGiveaway(id);
  if (!giveaway) return replyError(interaction, 'Giveaway introuvable.');

  if (giveaway.messageId) {
    const channel = interaction.guild.channels.cache.get(giveaway.channelId)
      ?? (await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null));
    const message = await channel?.messages.fetch(giveaway.messageId).catch(() => null);
    if (message) await message.delete().catch(() => null);
  }

  deleteGiveaway(id);

  await log(interaction.client, 'giveaways', 'delete', {
    guild: interaction.guild,
    fields: [
      { name: 'Prix', value: giveaway.prize, inline: true },
      { name: 'ID', value: `#${id}`, inline: true },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return interaction.reply({
    embeds: [buildEmbed({ dark: true, title: 'Giveaway supprimé', description: `Le giveaway **${giveaway.prize}** a été supprimé.` })],
    flags: MessageFlags.Ephemeral,
  });
}

export { listGiveaways };
