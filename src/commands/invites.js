import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getConfig } from '../config.js';
import { getInviteCounts, getInviteState, listInviteCounts, listInviteRecords } from '../db.js';
import { buildEmbed } from '../embeds.js';
import { fail } from '../permissions.js';

export default {
  category: 'Engagement',
  description: 'Suivi des invitations',
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Suivi des invitations')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('user')
        .setDescription('Détail des invitations d\'un membre')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre (défaut : toi)').setRequired(false)),
    )
    .addSubcommand((sub) => sub.setName('top').setDescription('Top 10 des inviteurs'))
    .addSubcommand((sub) =>
      sub
        .setName('masscheck')
        .setDescription('Invitations suspectes récentes (action manuelle)')
        .addIntegerOption((opt) => opt.setName('seuil').setDescription('Nombre min d\'invitations suspectes').setMinValue(2).setMaxValue(200).setRequired(false)),
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'user') {
        const user = interaction.options.getUser('membre') ?? interaction.user;
        const counts = getInviteCounts(user.id);
        const records = listInviteRecords(user.id, 10);

        const detail = records.length
          ? records.map((record) => {
            const date = Math.floor(new Date(record.joinedAt).getTime() / 1000);
            return `<@${record.inviteeId}> — <t:${date}:d>${record.suspect ? ' ⚠️ suspect' : ''}${record.leftAt ? ' — parti' : ''}`;
          }).join('\n')
          : 'Aucune invitation enregistrée.';

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: `Invitations — ${user.tag}`,
            fields: [
              { name: 'Réelles', value: String(counts.real ?? 0), inline: true },
              { name: 'Suspectes', value: String(counts.fake ?? 0), inline: true },
              { name: 'Départs', value: String(counts.leaves ?? 0), inline: true },
              { name: 'Détail récent', value: detail.slice(0, 1024), inline: false },
            ],
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'top') {
        const top = listInviteCounts()
          .sort((a, b) => (b.real ?? 0) - (a.real ?? 0))
          .slice(0, 10);

        const description = top.length
          ? top.map((entry, index) => `**${index + 1}.** <@${entry.userId}> — ${entry.real ?? 0} réelle(s) (${entry.fake ?? 0} suspecte(s))`).join('\n')
          : 'Aucune invitation enregistrée.';

        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Top inviteurs', description })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'masscheck') {
        const config = getConfig();
        const threshold = interaction.options.getInteger('seuil') ?? config.massInviteThreshold ?? 10;
        const maxAgeDays = config.massInviteMaxAgeDays ?? 7;
        const cutoff = Date.now() - maxAgeDays * 86_400_000;
        const counts = new Map();

        for (const record of getInviteState().records) {
          if (!record.inviterId) continue;
          if (!record.suspect) continue;
          if (new Date(record.joinedAt).getTime() < cutoff) continue;
          if (Number(record.accountAgeDays) >= maxAgeDays) continue;
          counts.set(record.inviterId, (counts.get(record.inviterId) ?? 0) + 1);
        }

        const suspects = [...counts.entries()]
          .filter(([, count]) => count > threshold)
          .sort((a, b) => b[1] - a[1]);

        const description = suspects.length
          ? suspects.map(([userId, count], index) => `**${index + 1}.** <@${userId}> — ${count} invitation(s) suspecte(s) de moins de ${maxAgeDays} jours`).join('\n')
          : `Aucun membre au-dessus de ${threshold} invitation(s) suspecte(s).`;

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: `Masscheck — seuil ${threshold}`,
            description: description.slice(0, 4000),
            fields: [{ name: 'Action', value: 'Vérification manuelle recommandée — aucune action automatique.', inline: false }],
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Invitations indisponibles.', '/invites');
    }
  },
};
