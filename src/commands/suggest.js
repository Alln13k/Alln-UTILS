import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed, buildError } from '../embeds.js';
import { log } from '../logger.js';
import { getConfig } from '../config.js';
import { nextSuggestionId, saveSuggestion } from '../db.js';
import { safeDefer, safeReply } from '../respond.js';
import { buildSuggestionPayload } from '../suggestionUi.js';

export default {
  category: 'Utilitaire',
  description: 'Envoie une suggestion',
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Envoie une suggestion au staff')
    .setDMPermission(false)
    .addStringOption((opt) => opt.setName('suggestion').setDescription('Ta suggestion').setRequired(true)),

  async execute(interaction) {
    const text = interaction.options.getString('suggestion', true).trim();
    const config = getConfig();
    const channel = config.suggestionsChannelId
      ? await interaction.guild.channels.fetch(config.suggestionsChannelId).catch(() => null)
      : null;

    if (!channel?.isTextBased()) {
      return safeReply(interaction, {
        embeds: [buildError('Aucun salon de suggestions configuré. Configure-le dans `/config`.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!(await safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;

    const suggestion = {
      id: nextSuggestionId(),
      guildId: interaction.guildId,
      channelId: channel.id,
      userId: interaction.user.id,
      username: interaction.user.tag,
      text: text.slice(0, 4000),
      status: 'pending',
      votes: { up: [], down: [] },
      createdAt: new Date().toISOString(),
      messageId: null,
    };

    const message = await channel.send(buildSuggestionPayload(suggestion)).catch(() => null);
    if (!message) {
      return safeReply(interaction, {
        embeds: [buildError('Impossible de publier la suggestion dans ce salon.')],
      });
    }

    suggestion.messageId = message.id;
    saveSuggestion(suggestion);

    await log(interaction.client, 'suggestions', 'new', {
      guild: interaction.guild,
      fields: [
        { name: 'Suggestion', value: `#${suggestion.id}`, inline: true },
        { name: 'Auteur', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
        { name: 'Contenu', value: suggestion.text.slice(0, 1000), inline: false },
      ],
    });

    return safeReply(interaction, {
      embeds: [buildEmbed({ dark: true, title: 'Suggestion envoyée', description: 'Ta suggestion a été transmise au staff.' })],
    });
  },
};
