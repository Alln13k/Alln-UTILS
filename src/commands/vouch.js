import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { addVouch, averageNote, getTool, hasVouched } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { logTo } from '../logging.js';
import { log } from '../logger.js';
import { fail, replyError } from '../permissions.js';

export default {
  category: 'Tools',
  description: 'Donne un avis sur une tool',
  data: new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Donne un avis sur une tool')
    .setDMPermission(false)
    .addStringOption((opt) => opt.setName('tool').setDescription('Nom de la tool').setRequired(true))
    .addIntegerOption((opt) =>
      opt
        .setName('note')
        .setDescription('Note de 1 à 5')
        .setMinValue(1)
        .setMaxValue(5)
        .setRequired(true),
    )
    .addStringOption((opt) => opt.setName('commentaire').setDescription('Commentaire').setMaxLength(400).setRequired(false)),

  async execute(interaction) {
    try {
      const name = interaction.options.getString('tool', true);
      const note = interaction.options.getInteger('note', true);
      const comment = interaction.options.getString('commentaire');

      const tool = getTool(name);
      if (!tool) return replyError(interaction, 'Tool introuvable.');
      if (tool.addedBy === interaction.user.id) return replyError(interaction, 'Tu ne peux pas vouch ta propre tool.');
      if (hasVouched(tool.slug, interaction.user.id)) return replyError(interaction, 'Tu as déjà vouché cette tool.');

      addVouch(tool.slug, {
        userId: interaction.user.id,
        username: interaction.user.tag,
        note,
        comment: comment ?? null,
      });

      const avg = averageNote(tool.slug);
      const config = getConfig();

      if (config.vouchRoleId) {
        await interaction.member.roles.add(config.vouchRoleId, 'Vouch').catch(() => null);
      }

      if (config.vouchChannelId) {
        await logTo(interaction.guild, config.vouchChannelId, {
          embeds: [buildEmbed({
            dark: true,
            title: `Vouch — ${tool.name}`,
            description: comment?.slice(0, 1000) ?? 'Sans commentaire.',
            fields: [
              { name: 'Note', value: `${'⭐'.repeat(note)} (${note}/5)`, inline: true },
              { name: 'Moyenne', value: `${avg}/5`, inline: true },
              { name: 'Auteur', value: `<@${interaction.user.id}>`, inline: true },
            ],
          })],
        });
      }

      await log(interaction.client, 'vouchs', 'add', {
        guild: interaction.guild,
        fields: [
          { name: 'Tool', value: tool.name, inline: true },
          { name: 'Note', value: String(note), inline: true },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: 'Vouch enregistré',
          description: `Merci pour ton avis sur **${tool.name}**.`,
          fields: [
            { name: 'Ta note', value: `${note}/5`, inline: true },
            { name: 'Nouvelle moyenne', value: `${avg}/5`, inline: true },
          ],
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Vouch impossible.', '/vouch');
    }
  },
};
