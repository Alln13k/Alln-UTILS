import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  deleteScheduleItem,
  listScheduleItems,
  nextScheduleId,
  saveScheduleItem,
} from '../db.js';
import { buildEmbed } from '../embeds.js';
import { parseDuration } from '../duration.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Publication',
  description: 'Planifie des messages',
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Planifie des messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Planifie un message')
        .addChannelOption((opt) => opt.setName('salon').setDescription('Salon cible').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
        .addStringOption((opt) => opt.setName('contenu').setDescription('Contenu du message').setMaxLength(4000).setRequired(true))
        .addStringOption((opt) => opt.setName('date').setDescription('Date ISO ou durée (1h, 2d)').setRequired(true))
        .addStringOption((opt) => opt.setName('titre').setDescription('Titre si embed').setMaxLength(200).setRequired(false))
        .addBooleanOption((opt) => opt.setName('embed').setDescription('Envoyer sous forme d\'embed').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Supprime un message planifié').addIntegerOption((opt) => opt.setName('id').setDescription('ID').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les messages planifiés')),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const channel = interaction.options.getChannel('salon', true);
        const content = interaction.options.getString('contenu', true);
        const rawDate = interaction.options.getString('date', true);
        const parsed = parseDuration(rawDate);
        if (!parsed) return replyError(interaction, 'Date invalide. Utilise une date ISO ou `1h`, `2d`.');

        const dueAtMs = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? parsed : Date.now() + parsed;
        if (dueAtMs <= Date.now()) return replyError(interaction, 'La date doit être dans le futur.');

        const item = {
          id: nextScheduleId(),
          guildId: interaction.guild.id,
          channelId: channel.id,
          userId: interaction.user.id,
          content,
          title: interaction.options.getString('titre') ?? null,
          embed: interaction.options.getBoolean('embed') ?? true,
          dueAt: new Date(dueAtMs).toISOString(),
          sent: false,
          createdAt: new Date().toISOString(),
        };
        saveScheduleItem(item);

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Message planifié',
            description: `ID \`#${item.id}\` — <#${channel.id}> — <t:${Math.floor(dueAtMs / 1000)}:F>`,
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'remove') {
        const id = interaction.options.getInteger('id', true);
        const removed = deleteScheduleItem(id);
        if (!removed) return replyError(interaction, 'Message planifié introuvable.');
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Message supprimé', description: `Le message planifié #${id} a été supprimé.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'list') {
        const items = listScheduleItems().sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
        const description = items.length
          ? items.map((item) => {
            const date = Math.floor(new Date(item.dueAt).getTime() / 1000);
            return `**#${item.id}** — <#${item.channelId}> — <t:${date}:F> — ${item.sent ? '✅ envoyé' : '⏳ en attente'}`;
          }).join('\n').slice(0, 4000)
          : 'Aucun message planifié.';
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Messages planifiés — ${items.length}`, description })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action planification impossible.', '/schedule');
    }
  },
};
