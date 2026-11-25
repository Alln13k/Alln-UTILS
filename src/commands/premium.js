import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { addPayment, getPremium, grantPremium, listPayments, listPremium, revokePremium } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

function formatTs(iso) {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'date inconnue';
  return `<t:${Math.floor(ms / 1000)}:F> (<t:${Math.floor(ms / 1000)}:R>)`;
}

export default {
  category: 'Premium',
  description: 'Gère les accès premium',
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Gère les accès premium')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('grant')
        .setDescription('Attribue un accès premium')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true))
        .addIntegerOption((opt) =>
          opt.setName('duree').setDescription('Durée en jours (défaut : config)').setMinValue(1).setMaxValue(3650).setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('revoke')
        .setDescription('Retire un accès premium')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Vérifie l\'accès premium d\'un membre')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les premiums actifs'))
    .addSubcommand((sub) =>
      sub
        .setName('payment')
        .setDescription('Enregistre un paiement (traçabilité uniquement)')
        .addUserOption((opt) => opt.setName('user').setDescription('Utilisateur concerné').setRequired(true))
        .addStringOption((opt) => opt.setName('montant').setDescription('Montant (ex : 5€)').setMaxLength(80).setRequired(true))
        .addStringOption((opt) => opt.setName('methode').setDescription('Méthode (ex : PayPal)').setMaxLength(80).setRequired(true))
        .addStringOption((opt) => opt.setName('note').setDescription('Note optionnelle').setMaxLength(500).setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('history')
        .setDescription('Historique des paiements d\'un utilisateur')
        .addUserOption((opt) => opt.setName('user').setDescription('Utilisateur (défaut : toi)').setRequired(false)),
    ),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;

      const sub = interaction.options.getSubcommand();
      const config = getConfig();

      if (sub === 'grant') {
        const user = interaction.options.getUser('membre', true);
        const days = interaction.options.getInteger('duree') ?? config.premiumDurationDays;
        const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

        grantPremium(user.id, expiresAt, interaction.user.id);

        if (config.premiumRoleId) {
          const member = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (member) await member.roles.add(config.premiumRoleId, `Premium ${days}j — ${interaction.user.tag}`).catch(() => null);
        }

        await log(interaction.client, 'premium', 'grant', {
          guild: interaction.guild,
          fields: [
            { name: 'Membre', value: `<@${user.id}>`, inline: true },
            { name: 'Durée', value: `${days} jour(s)`, inline: true },
            { name: 'Expire', value: formatTs(expiresAt), inline: false },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Premium accordé',
            description: `<@${user.id}> est premium jusqu'au ${formatTs(expiresAt)}.`,
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'revoke') {
        const user = interaction.options.getUser('membre', true);
        revokePremium(user.id);

        if (config.premiumRoleId) {
          const member = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (member) await member.roles.remove(config.premiumRoleId, `Premium révoqué — ${interaction.user.tag}`).catch(() => null);
        }

        await log(interaction.client, 'premium', 'revoke', {
          guild: interaction.guild,
          fields: [
            { name: 'Membre', value: `<@${user.id}>`, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Premium révoqué', description: `<@${user.id}> n'est plus premium.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'check') {
        const user = interaction.options.getUser('membre', true);
        const data = getPremium(user.id);
        if (!data) {
          return interaction.reply({
            embeds: [buildEmbed({ dark: true, title: 'Premium', description: `<@${user.id}> n'a pas de premium actif.` })],
            flags: MessageFlags.Ephemeral,
          });
        }

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Premium actif',
            description: `<@${user.id}> — expire le ${formatTs(data.expiresAt)}.`,
            fields: [{ name: 'Accordé par', value: `<@${data.grantedBy}>`, inline: true }],
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'list') {
        const active = listPremium().filter((entry) => new Date(entry.expiresAt).getTime() > Date.now());
        const description = active.length
          ? active.map((entry) => `<@${entry.userId}> — ${formatTs(entry.expiresAt)}`).join('\n').slice(0, 4000)
          : 'Aucun premium actif.';

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: `Premiums actifs — ${active.length}`, description })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'payment') {
        const user = interaction.options.getUser('user', true);
        const montant = interaction.options.getString('montant', true).trim();
        const methode = interaction.options.getString('methode', true).trim();
        const note = interaction.options.getString('note')?.trim() ?? null;

        const record = addPayment({
          userId: user.id,
          username: user.tag,
          amount: montant,
          method: methode,
          note,
          createdBy: interaction.user.id,
        });

        await log(interaction.client, 'payments', 'add', {
          guild: interaction.guild,
          fields: [
            { name: 'ID', value: String(record.id), inline: true },
            { name: 'Utilisateur', value: `<@${user.id}> (${user.tag})`, inline: true },
            { name: 'Montant', value: montant, inline: true },
            { name: 'Méthode', value: methode, inline: true },
            { name: 'Note', value: note ?? 'aucune', inline: false },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: `Paiement #${record.id} enregistré`,
            description: 'Traçabilité uniquement — aucun paiement n\'est effectué par le bot.',
            fields: [
              { name: 'Utilisateur', value: `<@${user.id}>`, inline: true },
              { name: 'Montant', value: montant, inline: true },
              { name: 'Méthode', value: methode, inline: true },
            ],
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'history') {
        const user = interaction.options.getUser('user') ?? interaction.user;
        const payments = listPayments(user.id).slice(-20).reverse();
        const description = payments.length
          ? payments.map((payment) =>
            `**#${payment.id}** — ${payment.amount} — ${payment.method}${payment.note ? ` — ${payment.note}` : ''} — <t:${Math.floor(new Date(payment.createdAt).getTime() / 1000)}:F>`,
          ).join('\n').slice(0, 4000)
          : 'Aucun paiement enregistré.';

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: `Historique paiements — ${user.tag}`,
            description,
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return replyError(interaction, 'Sous-commande inconnue.');
    } catch (err) {
      return fail(interaction, err, 'Action premium impossible.', '/premium');
    }
  },
};
