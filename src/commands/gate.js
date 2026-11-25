import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { addGate, getGate, listGates, removeGate } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export default {
  category: 'Gating',
  description: 'Rend un salon ou un leak accessible via un rôle',
  data: new SlashCommandBuilder()
    .setName('gate')
    .setDescription('Rend un salon ou un leak accessible via un rôle')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Crée un gate')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nom du gate').setMaxLength(40).setRequired(true))
        .addRoleOption((opt) => opt.setName('role').setDescription('Rôle autorisé').setRequired(true))
        .addChannelOption((opt) =>
          opt
            .setName('salon')
            .setDescription('Salon à verrouiller derrière ce rôle (optionnel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Supprime un gate')
        .addStringOption((opt) => opt.setName('nom').setDescription('Nom du gate').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Liste les gates et leurs accès')),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const sub = interaction.options.getSubcommand();
      if (sub === 'status') return statusCommand(interaction);

      if (sub === 'add') {
        const name = interaction.options.getString('nom', true);
        const role = interaction.options.getRole('role', true);
        const channel = interaction.options.getChannel('salon');

        if (getGate(name)) return replyError(interaction, 'Un gate porte déjà ce nom.');

        if (channel) {
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false }, { reason: `Gate ${name}` });
          await channel.permissionOverwrites.edit(role.id, {
            ViewChannel: true,
            ReadMessageHistory: true,
          }, { reason: `Gate ${name}` });
        }

        const gate = addGate({
          name,
          roleId: role.id,
          channelId: channel?.id ?? null,
          createdBy: interaction.user.id,
        });

        await log(interaction.client, 'gate', 'add', {
          guild: interaction.guild,
          fields: [
            { name: 'Nom', value: gate.name, inline: true },
            { name: 'Rôle', value: `<@&${role.id}>`, inline: true },
            { name: 'Salon', value: channel ? `<#${channel.id}>` : 'aucun', inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Gate créé',
            description: `**${gate.name}** → <@&${role.id}>${channel ? ` sur <#${channel.id}>` : ''}`,
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'remove') {
        const name = interaction.options.getString('nom', true);
        const gate = removeGate(name);

        if (gate.channelId) {
          const channel = await interaction.guild.channels.fetch(gate.channelId).catch(() => null);
          if (channel?.permissionOverwrites) {
            await channel.permissionOverwrites.delete(gate.roleId).catch(() => null);
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: null }, { reason: `Gate ${name} supprimé` }).catch(() => null);
          }
        }

        await log(interaction.client, 'gate', 'remove', {
          guild: interaction.guild,
          fields: [
            { name: 'Nom', value: gate.name, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Gate supprimé', description: `**${gate.name}** a été retiré.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action gate impossible.', '/gate');
    }
  },
};

function statusCommand(interaction) {
  const gates = listGates();
  const description = gates.length
    ? gates.map((g) => `**${g.name}** → <@&${g.roleId}>${g.channelId ? ` — <#${g.channelId}>` : ' — leak'}`).join('\n')
    : 'Aucun gate configuré.';

  return interaction.reply({
    embeds: [buildEmbed({ dark: true, title: `Gates — ${gates.length}`, description })],
    flags: MessageFlags.Ephemeral,
  });
}
