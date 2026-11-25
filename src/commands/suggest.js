import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import {
  getSuggestion,
  listSuggestions,
  nextSuggestionId,
  saveSuggestion,
  updateSuggestion,
} from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireStaff, replyError } from '../permissions.js';
import { buildSuggestionPayload } from '../suggestionUi.js';

export default {
  category: 'Engagement',
  description: 'Suggestions du serveur',
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Suggestions du serveur')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub.setName('post').setDescription('Poste une suggestion').addStringOption((opt) => opt.setName('texte').setDescription('Ta suggestion').setMaxLength(1500).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName('accept').setDescription('Accepte une suggestion (staff)').addIntegerOption((opt) => opt.setName('id').setDescription('ID').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName('deny').setDescription('Refuse une suggestion (staff)').addIntegerOption((opt) => opt.setName('id').setDescription('ID').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les suggestions en attente')),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();
      const config = getConfig();

      if (sub === 'post') {
        const text = interaction.options.getString('texte', true).trim();
        if (!config.suggestionsChannelId) return replyError(interaction, 'Aucun salon de suggestions configuré (`suggestionsChannelId`).');

        const channel = await interaction.guild.channels.fetch(config.suggestionsChannelId).catch(() => null);
        if (!channel?.isTextBased()) return replyError(interaction, 'Salon de suggestions introuvable.');

        const suggestion = {
          id: nextSuggestionId(),
          guildId: interaction.guild.id,
          channelId: channel.id,
          messageId: null,
          userId: interaction.user.id,
          text,
          status: 'pending',
          votes: { up: [], down: [] },
          createdAt: new Date().toISOString(),
        };

        const message = await channel.send(buildSuggestionPayload(suggestion));
        suggestion.messageId = message.id;
        saveSuggestion(suggestion);

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Suggestion postée', description: `Suggestion #${suggestion.id} envoyée dans <#${channel.id}>.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'accept' || sub === 'deny') {
        if (!(await requireStaff(interaction))) return;
        const id = interaction.options.getInteger('id', true);
        const suggestion = getSuggestion(id);
        if (!suggestion) return replyError(interaction, 'Suggestion introuvable.');

        const status = sub === 'accept' ? 'accepted' : 'denied';
        const updated = updateSuggestion(id, { status, decidedBy: interaction.user.id, decidedAt: new Date().toISOString() });

        const channel = interaction.guild.channels.cache.get(suggestion.channelId)
          ?? (await interaction.guild.channels.fetch(suggestion.channelId).catch(() => null));
        const message = await channel?.messages.fetch(suggestion.messageId).catch(() => null);
        if (message) await message.edit(buildSuggestionPayload(updated)).catch(() => null);

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Suggestion mise à jour', description: `Suggestion #${id} ${sub === 'accept' ? 'acceptée' : 'refusée'}.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'list') {
        if (!(await requireStaff(interaction))) return;
        const pending = listSuggestions('pending');
        const description = pending.length
          ? pending.map((suggestion) => `**#${suggestion.id}** — <@${suggestion.userId}> — ${suggestion.text.slice(0, 120)}`).join('\n')
          : 'Aucune suggestion en attente.';
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Suggestions en attente — ${pending.length}`, description })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action suggestion impossible.', '/suggest');
    }
  },
};
