import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { requireStaff } from '../permissions.js';
import { saveNote, getNotes } from '../db.js';

export default {
  category: 'Modération',
  description: 'Ajoute une note sur un utilisateur',
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Ajoute une note sur un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('utilisateur').setDescription('Utilisateur').setRequired(true))
    .addStringOption((opt) => opt.setName('note').setDescription('Contenu de la note').setRequired(true)),

  async execute(interaction) {
    if (!(await requireStaff(interaction))) return;
    const user = interaction.options.getUser('utilisateur', true);
    const note = interaction.options.getString('note', true);
    saveNote(user.id, note, interaction.user.id);

    return interaction.reply({
      embeds: [buildEmbed({ dark: true, title: 'Note', description: `Note ajoutée pour <@${user.id}>.` })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
