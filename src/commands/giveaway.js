import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed, buildError } from '../embeds.js';
import { log } from '../logger.js';
import { requireStaff } from '../permissions.js';
import { safeDefer, safeReply } from '../respond.js';
import {
  addGiveawayParticipant,
  deleteGiveaway,
  getGiveaway,
  listGiveaways,
  saveGiveaway,
  updateGiveaway,
} from '../db.js';

const EMOJI = '🎉';

function giveawayEmbed(gw, description) {
  return buildEmbed({
    dark: true,
    title: `🎁 Giveaway — ${gw.prize}`,
    description,
    fields: [
      { name: 'ID', value: gw.id, inline: true },
      { name: 'Hôte', value: `<@${gw.authorId}>`, inline: true },
      { name: 'Participants', value: String(gw.participants?.length ?? 0), inline: true },
    ],
  });
}

async function currentParticipants(client, guild, gw) {
  const stored = Array.isArray(gw.participants) ? gw.participants : [];
  if (stored.length > 0) return stored;

  const channel = guild.channels.cache.get(gw.channelId)
    ?? (await guild.channels.fetch(gw.channelId).catch(() => null));
  const message = channel?.isTextBased?.() && gw.messageId
    ? await channel.messages.fetch(gw.messageId).catch(() => null)
    : null;
  const reaction = message?.reactions?.cache?.get(EMOJI);
  const users = reaction ? await reaction.users.fetch().catch(() => null) : null;
  return users ? [...users.values()].filter((user) => !user.bot).map((user) => user.id) : [];
}

function pickWinner(participants) {
  return participants[Math.floor(Math.random() * participants.length)] ?? null;
}

async function finishGiveaway(client, interaction, gw, { announce = true } = {}) {
  const participants = await currentParticipants(client, interaction.guild, gw);
  const winnerId = pickWinner(participants);
  const updated = updateGiveaway(gw.id, {
    ended: true,
    participants,
    winnerId,
    endedAt: new Date().toISOString(),
  });

  const channel = interaction.guild.channels.cache.get(gw.channelId)
    ?? (await interaction.guild.channels.fetch(gw.channelId).catch(() => null));
  const message = channel?.isTextBased?.() && gw.messageId
    ? await channel.messages.fetch(gw.messageId).catch(() => null)
    : null;

  if (message) {
    await message.edit({
      embeds: [giveawayEmbed(
        updated ?? gw,
        winnerId ? `Gagnant : <@${winnerId}> !` : 'Aucun participant.',
      )],
      components: [],
    }).catch(() => null);
  }

  await log(client, 'giveaways', 'end', {
    guild: interaction.guild,
    fields: [
      { name: 'Giveaway', value: gw.id, inline: true },
      { name: 'Gagnant', value: winnerId ? `<@${winnerId}>` : 'Aucun', inline: true },
      { name: 'Participants', value: String(participants.length), inline: true },
      { name: 'Prix', value: gw.prize.slice(0, 1000), inline: false },
    ],
  });

  if (announce) {
    return safeReply(interaction, {
      embeds: [buildEmbed({
        dark: true,
        title: 'Giveaway terminé',
        description: winnerId
          ? `Gagnant : <@${winnerId}> dans <#${gw.channelId}>.`
          : 'Aucun participant.',
      })],
    });
  }
  return null;
}

export default {
  category: 'Giveaway',
  description: 'Gère les giveaways',
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Gère un giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Démarre un giveaway')
        .addStringOption((opt) => opt.setName('prix').setDescription('Prix du giveaway').setRequired(true))
        .addIntegerOption((opt) => opt.setName('duree').setDescription('Durée en minutes').setRequired(true).setMinValue(1).setMaxValue(10080))
        .addChannelOption((opt) => opt.setName('salon').setDescription('Salon du giveaway').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub.setName('end').setDescription('Termine un giveaway').addStringOption((opt) => opt.setName('id').setDescription('ID du giveaway').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName('reroll').setDescription('Reroll un giveaway').addStringOption((opt) => opt.setName('id').setDescription('ID du giveaway').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les giveaways actifs'))
    .addSubcommand((sub) =>
      sub.setName('delete').setDescription('Supprime un giveaway').addStringOption((opt) => opt.setName('id').setDescription('ID du giveaway').setRequired(true)),
    ),

  async execute(interaction) {
    if (!(await requireStaff(interaction))) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const prize = interaction.options.getString('prix', true).slice(0, 200);
      const minutes = interaction.options.getInteger('duree', true);
      const channel = interaction.options.getChannel('salon') ?? interaction.channel;
      if (!channel?.isTextBased?.()) {
        return safeReply(interaction, {
          embeds: [buildError('Le salon choisi n’accepte pas les messages.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const gw = {
        id: `${Date.now()}-${interaction.user.id}`,
        guildId: interaction.guildId,
        prize,
        channelId: channel.id,
        authorId: interaction.user.id,
        ended: false,
        participants: [],
        messageId: null,
        endsAt: Date.now() + minutes * 60_000,
        createdAt: new Date().toISOString(),
      };

      if (!(await safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;

      const message = await channel.send({
        embeds: [giveawayEmbed(gw, `Réagis avec ${EMOJI} pour participer !\nFin dans ${minutes} minute(s).`)],
      }).catch(() => null);

      if (!message) {
        return safeReply(interaction, {
          embeds: [buildError('Impossible de publier le giveaway dans ce salon.')],
        });
      }

      gw.messageId = message.id;
      saveGiveaway(gw);
      await message.react(EMOJI).catch(() => null);

      const collector = message.createReactionCollector({
        filter: (reaction, user) => reaction.emoji.name === EMOJI && !user.bot,
        time: minutes * 60_000,
      });
      collector.on('collect', (_reaction, user) => {
        const fresh = getGiveaway(gw.id);
        if (fresh && !fresh.ended) addGiveawayParticipant(gw.id, user.id);
      });
      collector.on('end', async () => {
        const fresh = getGiveaway(gw.id);
        if (!fresh || fresh.ended) return;
        try {
          await finishGiveaway(interaction.client, interaction, fresh, { announce: false });
          await interaction.followUp({
            embeds: [buildEmbed({
              dark: true,
              title: 'Giveaway terminé',
              description: `Résultat publié dans <#${gw.channelId}>.`,
            })],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        } catch (err) {
          console.error(`[alln-utils] giveaway timer ${gw.id}: ${err.stack ?? err.message}`);
        }
      });

      await log(interaction.client, 'giveaways', 'start', {
        guild: interaction.guild,
        fields: [
          { name: 'Giveaway', value: gw.id, inline: true },
          { name: 'Salon', value: `<#${channel.id}>`, inline: true },
          { name: 'Prix', value: prize, inline: false },
        ],
      });

      return safeReply(interaction, {
        embeds: [buildEmbed({
          dark: true,
          title: 'Giveaway démarré',
          description: `Giveaway lancé dans <#${channel.id}>.`,
        })],
      });
    }

    if (sub === 'end') {
      const gw = getGiveaway(interaction.options.getString('id', true));
      if (!gw) return safeReply(interaction, { embeds: [buildError('Giveaway introuvable.')], flags: MessageFlags.Ephemeral });
      if (gw.ended) return safeReply(interaction, { embeds: [buildError('Giveaway déjà terminé.')], flags: MessageFlags.Ephemeral });
      if (!(await safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
      return finishGiveaway(interaction.client, interaction, gw);
    }

    if (sub === 'reroll') {
      const gw = getGiveaway(interaction.options.getString('id', true));
      if (!gw) return safeReply(interaction, { embeds: [buildError('Giveaway introuvable.')], flags: MessageFlags.Ephemeral });
      const participants = await currentParticipants(interaction.client, interaction.guild, gw);
      const winnerId = pickWinner(participants);
      if (!winnerId) return safeReply(interaction, { embeds: [buildError('Aucun participant.')], flags: MessageFlags.Ephemeral });

      if (!(await safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
      updateGiveaway(gw.id, { winnerId });

      await log(interaction.client, 'giveaways', 'reroll', {
        guild: interaction.guild,
        fields: [
          { name: 'Giveaway', value: gw.id, inline: true },
          { name: 'Nouveau gagnant', value: `<@${winnerId}>`, inline: true },
        ],
      });

      return safeReply(interaction, {
        embeds: [buildEmbed({ dark: true, title: 'Reroll', description: `Nouveau gagnant : <@${winnerId}>.` })],
      });
    }

    if (sub === 'list') {
      const active = listGiveaways().filter((gw) => !gw.ended);
      const description = active.length
        ? active.map((gw) => `#${gw.id} — ${gw.prize} (<#${gw.channelId}>)`).join('\n')
        : 'Aucun giveaway actif.';
      return safeReply(interaction, {
        embeds: [buildEmbed({ dark: true, title: 'Giveaways actifs', description })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const gw = getGiveaway(interaction.options.getString('id', true));
    if (!gw) return safeReply(interaction, { embeds: [buildError('Giveaway introuvable.')], flags: MessageFlags.Ephemeral });
    deleteGiveaway(gw.id);
    await log(interaction.client, 'giveaways', 'delete', {
      guild: interaction.guild,
      fields: [{ name: 'Giveaway', value: gw.id, inline: true }],
    });
    return safeReply(interaction, {
      embeds: [buildEmbed({ dark: true, title: 'Supprimé', description: `Giveaway #${gw.id} supprimé.` })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
