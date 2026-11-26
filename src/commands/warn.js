import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { requireStaff } from '../permissions.js';
import { safeDefer, safeReply } from '../respond.js';
import { addWarning, clearWarns, getWarns } from '../db.js';
import { getConfig } from '../config.js';
import { applyWarnThresholds } from '../warnSystem.js';

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

export default {
  category: 'Modération',
  description: 'Gère les warns',
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Gère les warns d\'un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Warn un utilisateur')
        .addUserOption((opt) => opt.setName('utilisateur').setDescription('Utilisateur à warn').setRequired(true))
        .addStringOption((opt) => opt.setName('raison').setDescription('Raison du warn').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Liste les warns d\'un utilisateur')
        .addUserOption((opt) => opt.setName('utilisateur').setDescription('Utilisateur').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Efface les warns d\'un utilisateur')
        .addUserOption((opt) => opt.setName('utilisateur').setDescription('Utilisateur').setRequired(true)),
    ),

  async execute(interaction) {
    if (!(await requireStaff(interaction))) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const user = interaction.options.getUser('utilisateur', true);
      const raison = interaction.options.getString('raison', true);
      addWarning(user.id, interaction.user.id, raison);

      if (!(await safeDefer(interaction, EPHEMERAL))) return;

      const total = getWarns(user.id).length;
      const thresholds = getConfig().warnThresholds ?? { mute: 3, kick: 5, ban: 7 };
      const member = interaction.options.getMember('utilisateur');
      const action = member
        ? await applyWarnThresholds(interaction.client, interaction.guild, member, {
          moderator: interaction.user.id,
          reason: raison,
        })
        : { action: null };

      await log(interaction.client, 'moderation', 'warn', {
        guild: interaction.guild,
        fields: [
          { name: 'Utilisateur', value: `<@${user.id}>`, inline: true },
          { name: 'Raison', value: raison.slice(0, 1000), inline: false },
          { name: 'Total warns', value: String(total), inline: true },
          { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });

      const sanction = action.action
        ? `\nSanction automatique : **${action.action}**.`
        : `\nProchain palier : mute à ${thresholds.mute ?? 3}, kick à ${thresholds.kick ?? 5}, ban à ${thresholds.ban ?? 7}.`;

      return safeReply(interaction, {
        embeds: [buildEmbed({
          dark: true,
          title: 'Warn',
          description: `<@${user.id}> warné (${total} warn(s)).${sanction}`,
        })],
      });
    }

    if (sub === 'list') {
      const user = interaction.options.getUser('utilisateur', true);
      const warns = getWarns(user.id);
      const description = warns.length
        ? warns.map((w) => `#${w.id} — ${w.reason} (<@${w.moderatorId}>)`).join('\n')
        : 'Aucun warn.';
      return safeReply(interaction, {
        embeds: [buildEmbed({ dark: true, title: `Warns — <@${user.id}>`, description })],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'clear') {
      const user = interaction.options.getUser('utilisateur', true);
      if (!(await safeDefer(interaction, EPHEMERAL))) return;
      const count = clearWarns(user.id);
      await log(interaction.client, 'moderation', 'clearwarns', {
        guild: interaction.guild,
        fields: [
          { name: 'Utilisateur', value: `<@${user.id}>`, inline: true },
          { name: 'Warns effacés', value: String(count), inline: true },
          { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });
      return safeReply(interaction, {
        embeds: [buildEmbed({ dark: true, title: 'Clear warns', description: `${count} warn(s) effacé(s) pour <@${user.id}>.` })],
      });
    }

    return null;
  },
};
