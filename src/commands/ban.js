import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Modération',
  description: 'Bannit un membre',
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('membre').setDescription('Membre à bannir').setRequired(true))
    .addStringOption((opt) => opt.setName('raison').setDescription('Raison du ban').setMaxLength(512).setRequired(false)),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const targetUser = interaction.options.getUser('membre', true);
      const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';

      if (targetUser.id === interaction.user.id) return replyError(interaction, 'Tu ne peux pas te bannir toi-même.');
      if (targetUser.id === interaction.client.user.id) return replyError(interaction, 'Je ne peux pas me bannir moi-même.');

      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      if (targetMember) {
        if (!targetMember.bannable) return replyError(interaction, 'Ce membre ne peut pas être banni : rôle supérieur ou permissions insuffisantes.');
        if (interaction.member.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
          return replyError(interaction, 'Ton rôle doit être au-dessus de celui du membre ciblé.');
        }
      }

      await interaction.guild.members.ban(targetUser.id, { reason: `${interaction.user.tag} — ${reason}` });

      await log(interaction.client, 'moderation', 'ban', {
        guild: interaction.guild,
        title: 'Ban',
        fields: [
          { name: 'Cible', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
          { name: 'ID', value: targetUser.id, inline: true },
          { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Action', value: 'ban', inline: true },
          { name: 'Raison', value: reason.slice(0, 1000), inline: false },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Membre banni', description: `<@${targetUser.id}> a été banni.\n**Raison :** ${reason}` })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Ban impossible. Vérifie mes permissions et la hiérarchie des rôles.', '/ban');
    }
  },
};
