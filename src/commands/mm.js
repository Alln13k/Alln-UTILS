import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  getEscrow,
  listEscrows,
  nextEscrowId,
  saveEscrow,
  updateEscrow,
} from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';
import { createPrivateTicket } from '../ticketFactory.js';

function statusLabel(escrow) {
  if (escrow.status === 'closed') return 'Clôturé';
  if (escrow.confirmations?.a && escrow.confirmations?.b) return 'Confirmé — en attente de clôture';
  return 'En attente des confirmations';
}

export function buildEscrowEmbed(escrow) {
  return buildEmbed({
    dark: true,
    title: `Escrow #${escrow.id} — ${escrow.amount}`,
    description: 'Traçabilité uniquement : aucun paiement n\'est effectué par le bot.',
    fields: [
      { name: 'Partie A', value: `<@${escrow.userA}> — ${escrow.confirmations?.a ? '✅ confirmé' : '⏳ en attente'}`, inline: true },
      { name: 'Partie B', value: `<@${escrow.userB}> — ${escrow.confirmations?.b ? '✅ confirmé' : '⏳ en attente'}`, inline: true },
      { name: 'Montant', value: escrow.amount, inline: true },
      { name: 'Statut', value: statusLabel(escrow), inline: false },
      { name: 'Ouvert par', value: `<@${escrow.createdBy}>`, inline: true },
    ],
  });
}

export function buildEscrowRow(escrow) {
  if (escrow.status === 'closed') return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mm_confirm:${escrow.id}:a`)
      .setLabel('Je confirme (A)')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(Boolean(escrow.confirmations?.a)),
    new ButtonBuilder()
      .setCustomId(`mm_confirm:${escrow.id}:b`)
      .setLabel('Je confirme (B)')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(Boolean(escrow.confirmations?.b)),
  )];
}

export default {
  category: 'Sécurité',
  description: 'Middleman / escrow — traçabilité uniquement',
  data: new SlashCommandBuilder()
    .setName('mm')
    .setDescription('Middleman / escrow — traçabilité uniquement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('open')
        .setDescription('Ouvre un ticket escrow')
        .addUserOption((opt) => opt.setName('user_a').setDescription('Première partie').setRequired(true))
        .addUserOption((opt) => opt.setName('user_b').setDescription('Deuxième partie').setRequired(true))
        .addStringOption((opt) => opt.setName('montant').setDescription('Montant convenu').setMaxLength(80).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('close')
        .setDescription('Clôture un escrow')
        .addIntegerOption((opt) => opt.setName('id').setDescription('ID de l\'escrow').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les escrows')),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;
      const sub = interaction.options.getSubcommand();

      if (sub === 'open') {
        const a = interaction.options.getUser('user_a', true);
        const b = interaction.options.getUser('user_b', true);
        if (a.id === b.id) return replyError(interaction, 'Les deux parties doivent être différentes.');

        const amount = interaction.options.getString('montant', true).trim();
        const id = nextEscrowId();

        const { ticket, channel } = await createPrivateTicket({
          interaction,
          guild: interaction.guild,
          category: 'escrow',
          subject: `Escrow #${id} — ${amount}`,
          description: `Parties : <@${a.id}> et <@${b.id}>\nMontant : ${amount}`,
          userId: a.id,
          username: a.tag,
          accessUserIds: [b.id],
        });

        const escrow = {
          id,
          status: 'pending',
          userA: a.id,
          userB: b.id,
          amount,
          confirmations: { a: false, b: false },
          channelId: channel.id,
          ticketId: ticket.id,
          createdBy: interaction.user.id,
          createdAt: new Date().toISOString(),
          closedAt: null,
        };
        saveEscrow(escrow);

        const panel = await channel.send({
          embeds: [buildEscrowEmbed(escrow)],
          components: buildEscrowRow(escrow),
        });
        updateEscrow(id, { panelMessageId: panel.id });

        await log(interaction.client, 'escrow', 'open', {
          guild: interaction.guild,
          fields: [
            { name: 'ID', value: `#${id}`, inline: true },
            { name: 'Partie A', value: `<@${a.id}>`, inline: true },
            { name: 'Partie B', value: `<@${b.id}>`, inline: true },
            { name: 'Montant', value: amount, inline: true },
            { name: 'Ticket', value: `<#${channel.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Escrow ouvert', description: `Ticket <#${channel.id}> — les deux parties doivent confirmer.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'close') {
        const id = interaction.options.getInteger('id', true);
        const escrow = getEscrow(id);
        if (!escrow) return replyError(interaction, 'Escrow introuvable.');
        if (escrow.status === 'closed') return replyError(interaction, 'Escrow déjà clôturé.');

        const updated = updateEscrow(id, {
          status: 'closed',
          closedAt: new Date().toISOString(),
          closedBy: interaction.user.id,
        });

        const channel = await interaction.guild.channels.fetch(escrow.channelId).catch(() => null);
        if (channel?.isTextBased()) {
          const message = await channel.messages.fetch(escrow.panelMessageId).catch(() => null);
          if (message) await message.edit({ embeds: [buildEscrowEmbed(updated)], components: [] }).catch(() => null);
        }

        await log(interaction.client, 'escrow', 'close', {
          guild: interaction.guild,
          fields: [
            { name: 'ID', value: `#${id}`, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Parties', value: `<@${escrow.userA}> / <@${escrow.userB}>`, inline: false },
            { name: 'Montant', value: escrow.amount, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Escrow #${id} clôturé`, description: 'Traçabilité conservée dans `data/escrow.json`.' })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'list') {
        const escrows = listEscrows().slice(-20).reverse();
        const description = escrows.length
          ? escrows.map((e) => `**#${e.id}** — <@${e.userA}> / <@${e.userB}> — ${e.amount} — ${statusLabel(e)}`).join('\n')
          : 'Aucun escrow.';
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Escrows — ${escrows.length}`, description: description.slice(0, 4000) })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Gestion escrow impossible.', '/mm');
    }
  },
};
