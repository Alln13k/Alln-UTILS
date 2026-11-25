import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { nextPollId, savePoll } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, replyError } from '../permissions.js';
import { buildPollPayload } from '../pollUi.js';

export default {
  category: 'Engagement',
  description: 'Sondage oui/non rapide avec résultats temps réel',
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Sondage oui/non rapide avec résultats temps réel')
    .setDMPermission(false)
    .addStringOption((opt) => opt.setName('question').setDescription('Question').setMaxLength(200).setRequired(true))
    .addChannelOption((opt) =>
      opt
        .setName('salon')
        .setDescription('Salon cible (défaut : salon actuel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ),

  async execute(interaction) {
    try {
      const question = interaction.options.getString('question', true).trim();
      const target = interaction.options.getChannel('salon') ?? interaction.channel;
      if (!target?.isTextBased()) return replyError(interaction, 'Salon cible invalide.');

      const poll = {
        id: nextPollId(),
        guildId: interaction.guild.id,
        channelId: target.id,
        messageId: null,
        userId: interaction.user.id,
        question,
        options: [
          { text: 'Oui', votes: [] },
          { text: 'Non', votes: [] },
        ],
        anonymous: false,
        type: 'vote',
        ended: false,
        createdAt: new Date().toISOString(),
      };

      const message = await target.send(buildPollPayload(poll));
      poll.messageId = message.id;
      savePoll(poll);

      await log(interaction.client, 'publication', 'embed', {
        guild: interaction.guild,
        title: 'Vote rapide créé',
        fields: [
          { name: 'Question', value: question.slice(0, 600), inline: false },
          { name: 'Salon', value: `<#${target.id}>`, inline: true },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Vote lancé', description: `Sondage oui/non publié dans <#${target.id}>.` })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Vote impossible.', '/vote');
    }
  },
};
