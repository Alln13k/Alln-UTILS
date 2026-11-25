import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { getPoll, listPolls, nextPollId, savePoll, updatePoll } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireStaff, replyError } from '../permissions.js';
import { buildPollPayload } from '../pollUi.js';

export default {
  category: 'Engagement',
  description: 'Sondages du serveur',
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Sondages du serveur')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Crée un sondage')
        .addStringOption((opt) => opt.setName('question').setDescription('Question').setMaxLength(200).setRequired(true))
        .addStringOption((opt) => opt.setName('option1').setDescription('Option 1').setMaxLength(80).setRequired(true))
        .addStringOption((opt) => opt.setName('option2').setDescription('Option 2').setMaxLength(80).setRequired(true))
        .addStringOption((opt) => opt.setName('option3').setDescription('Option 3').setMaxLength(80).setRequired(false))
        .addStringOption((opt) => opt.setName('option4').setDescription('Option 4').setMaxLength(80).setRequired(false))
        .addStringOption((opt) => opt.setName('option5').setDescription('Option 5').setMaxLength(80).setRequired(false))
        .addChannelOption((opt) => opt.setName('salon').setDescription('Salon cible').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addBooleanOption((opt) => opt.setName('anonymous').setDescription('Vote anonyme (totaux uniquement)').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub.setName('end').setDescription('Clôture un sondage').addIntegerOption((opt) => opt.setName('id').setDescription('ID').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les sondages actifs')),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'create') {
        if (!(await requireStaff(interaction))) return;

        const question = interaction.options.getString('question', true).trim();
        const options = [1, 2, 3, 4, 5]
          .map((index) => interaction.options.getString(`option${index}`))
          .filter((value) => value && value.trim())
          .map((value) => ({ text: value.trim(), votes: [] }));

        if (options.length < 2) return replyError(interaction, 'Il faut au moins deux options.');

        const target = interaction.options.getChannel('salon') ?? interaction.channel;
        if (!target?.isTextBased()) return replyError(interaction, 'Salon cible invalide.');

        const poll = {
          id: nextPollId(),
          guildId: interaction.guild.id,
          channelId: target.id,
          messageId: null,
          userId: interaction.user.id,
          question,
          options,
          anonymous: interaction.options.getBoolean('anonymous') ?? false,
          type: 'poll',
          ended: false,
          createdAt: new Date().toISOString(),
        };

        const message = await target.send(buildPollPayload(poll));
        poll.messageId = message.id;
        savePoll(poll);

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Sondage créé', description: `Sondage #${poll.id} publié dans <#${target.id}>.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'end') {
        if (!(await requireStaff(interaction))) return;
        const id = interaction.options.getInteger('id', true);
        const poll = getPoll(id);
        if (!poll) return replyError(interaction, 'Sondage introuvable.');
        if (poll.ended) return replyError(interaction, 'Sondage déjà clôturé.');

        const updated = updatePoll(id, { ended: true, endedAt: new Date().toISOString() });
        const channel = interaction.guild.channels.cache.get(poll.channelId)
          ?? (await interaction.guild.channels.fetch(poll.channelId).catch(() => null));
        const message = await channel?.messages.fetch(poll.messageId).catch(() => null);
        if (message) await message.edit(buildPollPayload(updated)).catch(() => null);

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Sondage clôturé', description: `Sondage #${id} terminé.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'list') {
        const active = listPolls(true);
        const description = active.length
          ? active.map((poll) => `**#${poll.id}** — ${poll.question} — <#${poll.channelId}>`).join('\n')
          : 'Aucun sondage actif.';
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Sondages actifs — ${active.length}`, description })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action sondage impossible.', '/poll');
    }
  },
};
