import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { addNote, listNotes, removeNote } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Modération',
  description: 'Notes privées du staff',
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Notes privées du staff')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Ajoute une note')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true))
        .addStringOption((opt) => opt.setName('texte').setDescription('Note').setMaxLength(1000).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Liste les notes d\'un membre').addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Supprime une note')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true))
        .addIntegerOption((opt) => opt.setName('index').setDescription('Numéro de la note').setMinValue(1).setRequired(true)),
    ),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;
      const sub = interaction.options.getSubcommand();
      const user = interaction.options.getUser('membre', true);

      if (sub === 'add') {
        const text = interaction.options.getString('texte', true).trim();
        addNote(user.id, { text, authorId: interaction.user.id, authorTag: interaction.user.tag });
        const count = listNotes(user.id).length;
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Note ajoutée', description: `Note #${count} ajoutée pour <@${user.id}>.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'list') {
        const notes = listNotes(user.id);
        const description = notes.length
          ? notes.map((note, index) => {
            const date = Math.floor(new Date(note.createdAt).getTime() / 1000);
            return `**#${index + 1}** — <t:${date}:d> — <@${note.authorId}>\n${note.text}`;
          }).join('\n\n').slice(0, 4000)
          : 'Aucune note.';
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Notes — ${user.tag}`, description })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'remove') {
        const index = interaction.options.getInteger('index', true);
        const removed = removeNote(user.id, index);
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Note supprimée', description: `Note #${index} retirée.\n> ${removed.text.slice(0, 500)}` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return replyError(interaction, 'Sous-commande inconnue.');
    } catch (err) {
      return fail(interaction, err, 'Action note impossible.', '/note');
    }
  },
};
