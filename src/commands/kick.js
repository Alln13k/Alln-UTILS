import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Modération',
  description: 'Expulse un membre',
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('membre').setDescription('Membre à expulser').setRequired(true))
    .addStringOption((opt) => opt.setName('raison').setDescription('Raison de l\'expulsion').setMaxLength(512).setRequired(false)),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const targetUser = interaction.options.getUser('membre', true);
      const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';

      if (targetUser.id === interaction.user.id) return replyError(interaction, 'Tu ne peux pas t\'expulser toi-même.');
      if (targetUser.id === interaction.client.user.id) return replyError(interaction, 'Je ne peux pas m\'expulser moi-même.');

      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) return replyError(interaction, 'Ce membre n\'est pas sur le serveur.');
      if (!targetMember.kickable) return replyError(interaction, 'Ce membre ne peut pas être expulsé : rôle supérieur ou permissions insuffisantes.');
      if (interaction.member.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
        return replyError(interaction, 'Ton rôle doit être au-dessus de celui du membre ciblé.');
      }

      await targetMember.kick(`${interaction.user.tag} — ${reason}`);

      await log(interaction.client, 'moderation', 'kick', {
        guild: interaction.guild,
        title: 'Kick',
        fields: [
          { name: 'Cible', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
          { name: 'ID', value: targetUser.id, inline: true },
          { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Action', value: 'kick', inline: true },
          { name: 'Raison', value: reason.slice(0, 1000), inline: false },
        ],
      });

      return interaction.reply({
        embeds: [buildEmbed({ dark: true, title: 'Membre expulsé', description: `<@${targetUser.id}> a été expulsé.\n**Raison :** ${reason}` })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Expulsion impossible. Vérifie mes permissions et la hiérarchie des rôles.', '/kick');
    }
  },
};
