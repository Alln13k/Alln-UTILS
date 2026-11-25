import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { countOpenTicketsFor, isBlacklisted, listReportsAgainst, vouchsGiven, vouchsReceived } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail } from '../permissions.js';

export default {
  category: 'Utilitaires',
  description: 'Fiche de réputation d\'un utilisateur',
  data: new SlashCommandBuilder()
    .setName('scamcheck')
    .setDescription('Fiche de réputation d\'un utilisateur')
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName('membre').setDescription('Utilisateur à vérifier').setRequired(true)),

  async execute(interaction) {
    try {
      const user = interaction.options.getUser('membre', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      const received = vouchsReceived(user.id);
      const given = vouchsGiven(user.id);
      const openTickets = countOpenTicketsFor(user.id);
      const blacklisted = isBlacklisted(user.id);
      const reports = listReportsAgainst(user.id);
      const openReports = reports.filter((report) => report.status === 'open').length;

      let verdict = 'clean';
      if (blacklisted) verdict = 'blacklist';
      else if (reports.length > 0) verdict = 'reported';
      else if (received.length === 0) verdict = 'suspect';

      const verdictLine = verdict === 'blacklist'
        ? '🔴 **BLACKLIST** — accès refusé par le bot.'
        : verdict === 'reported'
          ? `🟠 **SIGNALÉ** — ${reports.length} signalement(s), dont ${openReports} ouvert(s).`
          : verdict === 'suspect'
            ? '🟠 **SUSPECT** — aucun vouch reçu.'
            : '🟢 **CLEAN** — vouchs reçus, aucun signalement.';

      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: `Scamcheck — ${user.tag}`,
          thumbnail: user.displayAvatarURL({ size: 256 }),
          fields: [
            { name: 'Utilisateur', value: `<@${user.id}>`, inline: true },
            { name: 'ID', value: user.id, inline: true },
            { name: 'Blacklist', value: blacklisted ? 'oui' : 'non', inline: true },
            { name: 'Vouchs reçus', value: String(received.length), inline: true },
            { name: 'Vouchs donnés', value: String(given.length), inline: true },
            { name: 'Tickets ouverts', value: String(openTickets), inline: true },
            { name: 'Signalements', value: `${reports.length} (${openReports} ouvert(s))`, inline: true },
            {
              name: 'Arrivée sur le serveur',
              value: member?.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>` : 'inconnue',
              inline: false,
            },
            { name: 'Verdict', value: verdictLine, inline: false },
          ],
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Scamcheck impossible.', '/scamcheck');
    }
  },
};
