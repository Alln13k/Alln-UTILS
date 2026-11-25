import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { getConfig, setConfigValue } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { buildLogsEventsPage, buildLogsStatus } from '../configUi.js';
import {
  clearLogOverride,
  countActiveLogs,
  isLogEnabled,
  listLogOverrides,
  log,
  logEventsFor,
  muteAllLogs,
  setLogCategory,
  setLogEvent,
  setLogOverride,
  unmuteAllLogs,
} from '../logger.js';
import { fail, isAdmin, replyError } from '../permissions.js';

function canManage(member) {
  if (!member) return false;
  if (isAdmin(member)) return true;
  const { staffRoleId } = getConfig();
  return Boolean(staffRoleId && member.roles?.cache?.has(staffRoleId));
}

async function requireLogManager(interaction) {
  if (canManage(interaction.member)) return true;
  await replyError(interaction, 'Réservé aux administrateurs ou au rôle staff.');
  return false;
}

export default {
  category: 'Administration',
  description: 'Configure les logs personnalisés',
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configure les logs personnalisés')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Active ou désactive un événement')
        .addStringOption((opt) => opt.setName('categorie').setDescription('Catégorie').setRequired(true))
        .addStringOption((opt) => opt.setName('evenement').setDescription('Événement').setRequired(true))
        .addStringOption((opt) => opt.setName('etat').setDescription('État').setRequired(true).addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })),
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggleall')
        .setDescription('Active ou désactive une catégorie')
        .addStringOption((opt) => opt.setName('categorie').setDescription('Catégorie').setRequired(true))
        .addStringOption((opt) => opt.setName('etat').setDescription('État').setRequired(true).addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })),
    )
    .addSubcommand((sub) => sub.setName('muteall').setDescription('Coupe tous les logs sauf admin et security'))
    .addSubcommand((sub) => sub.setName('unmuteall').setDescription('Réactive tous les logs'))
    .addSubcommand((sub) =>
      sub
        .setName('setchannel')
        .setDescription('Redirige un événement vers un salon')
        .addStringOption((opt) => opt.setName('categorie').setDescription('Catégorie').setRequired(true))
        .addStringOption((opt) => opt.setName('evenement').setDescription('Événement').setRequired(true))
        .addChannelOption((opt) => opt.setName('salon').setDescription('Salon cible').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('clearchannel')
        .setDescription('Retire l\'override d\'un événement')
        .addStringOption((opt) => opt.setName('categorie').setDescription('Catégorie').setRequired(true))
        .addStringOption((opt) => opt.setName('evenement').setDescription('Événement').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName('events').setDescription('État des événements d\'une catégorie').addStringOption((opt) => opt.setName('categorie').setDescription('Catégorie').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Vue globale des logs'))
    .addSubcommand((sub) =>
      sub
        .setName('purge')
        .setDescription('Supprime les logs antérieurs à une date')
        .addStringOption((opt) => opt.setName('avant_date').setDescription('Date ISO (AAAA-MM-JJ)').setRequired(true))
        .addStringOption((opt) => opt.setName('confirmation').setDescription('Écris CONFIRM pour valider').setMaxLength(16).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('exclude')
        .setDescription('Exclut un salon du logging')
        .addChannelOption((opt) => opt.setName('salon').setDescription('Salon à exclure').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unexclude')
        .setDescription('Réintègre un salon exclu')
        .addChannelOption((opt) => opt.setName('salon').setDescription('Salon').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
    ),

  async execute(interaction) {
    try {
      if (!(await requireLogManager(interaction))) return;
      const sub = interaction.options.getSubcommand();
      const config = getConfig();

      if (sub === 'toggle') {
        const category = interaction.options.getString('categorie', true).trim().toLowerCase();
        const event = interaction.options.getString('evenement', true).trim();
        const enabled = interaction.options.getString('etat', true) === 'on';

        if (!logEventsFor(category)) return replyError(interaction, `Catégorie inconnue : \`${category}\`.`);
        if (!(event in logEventsFor(category))) return replyError(interaction, `Événement inconnu : \`${category}.${event}\`.`);

        setLogEvent(category, event, enabled);
        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Log mis à jour',
            description: `\`${category}.${event}\` est maintenant **${enabled ? 'actif' : 'silencieux'}**.`,
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'toggleall') {
        const category = interaction.options.getString('categorie', true).trim().toLowerCase();
        const enabled = interaction.options.getString('etat', true) === 'on';
        if (!logEventsFor(category)) return replyError(interaction, `Catégorie inconnue : \`${category}\`.`);
        const count = setLogCategory(category, enabled);
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Catégorie mise à jour', description: `**${count}** événement(s) de \`${category}\` ${enabled ? 'activés' : 'désactivés'}.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'muteall') {
        muteAllLogs();
        const { active, total } = countActiveLogs();
        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Logs mis en sourdine',
            description: `Tous les logs sont coupés sauf **admin** et **security** (${active}/${total} restent actifs).`,
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'unmuteall') {
        unmuteAllLogs();
        const { active, total } = countActiveLogs();
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Logs réactivés', description: `${active}/${total} événements actifs.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'setchannel') {
        const category = interaction.options.getString('categorie', true).trim().toLowerCase();
        const event = interaction.options.getString('evenement', true).trim();
        const channel = interaction.options.getChannel('salon', true);

        if (!logEventsFor(category) || !(event in logEventsFor(category))) {
          return replyError(interaction, `Événement inconnu : \`${category}.${event}\`.`);
        }
        if (channel.id === config.raidTrapChannelId) {
          return replyError(interaction, 'Impossible de rediriger un log vers le salon raid trap.');
        }

        setLogOverride(category, event, channel.id);
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Override de log', description: `\`${category}.${event}\` → <#${channel.id}>.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'clearchannel') {
        const category = interaction.options.getString('categorie', true).trim().toLowerCase();
        const event = interaction.options.getString('evenement', true).trim();
        clearLogOverride(category, event);
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Override supprimé', description: `\`${category}.${event}\` utilise de nouveau le salon principal.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'events') {
        const category = interaction.options.getString('categorie', true).trim().toLowerCase();
        if (!logEventsFor(category)) return replyError(interaction, `Catégorie inconnue : \`${category}\`.`);
        return interaction.reply({ ...buildLogsEventsPage(category, 0), flags: MessageFlags.Ephemeral });
      }

      if (sub === 'status') {
        return interaction.reply({ ...buildLogsStatus(listLogOverrides()), flags: MessageFlags.Ephemeral });
      }

      if (sub === 'purge') {
        const raw = interaction.options.getString('avant_date', true).trim();
        const confirmation = interaction.options.getString('confirmation', true).trim();
        if (confirmation !== 'CONFIRM') return replyError(interaction, 'Confirmation invalide. Écris exactement `CONFIRM`.');

        const beforeMs = new Date(raw).getTime();
        if (!Number.isFinite(beforeMs)) return replyError(interaction, 'Date invalide. Utilise `AAAA-MM-JJ`.');

        if (!config.logChannelId) return replyError(interaction, 'Aucun salon de logs configuré.');
        const channel = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
        if (!channel?.isTextBased()) return replyError(interaction, 'Salon de logs introuvable.');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        let deleted = 0;
        let before;

        for (let page = 0; page < 10; page += 1) {
          const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
          if (!batch || batch.size === 0) break;

          const targets = batch.filter((message) => message.createdTimestamp < beforeMs);
          if (targets.size > 0) {
            const recent = targets.filter((message) => Date.now() - message.createdTimestamp < 14 * 86_400_000);
            if (recent.size > 0) {
              const bulk = await channel.bulkDelete(recent, true).catch(() => null);
              deleted += bulk?.size ?? 0;
            }
            const old = targets.filter((message) => Date.now() - message.createdTimestamp >= 14 * 86_400_000);
            for (const message of old.values()) {
              await message.delete().catch(() => null);
              deleted += 1;
            }
          }

          before = batch.last()?.id;
          if (batch.size < 100) break;
        }

        await log(interaction.client, 'admin', 'purgeLogs', {
          guild: interaction.guild,
          fields: [
            { name: 'Avant', value: new Date(beforeMs).toISOString(), inline: true },
            { name: 'Messages supprimés', value: String(deleted), inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });

        return interaction.editReply({
          embeds: [buildEmbed({ dark: true, title: 'Purge terminée', description: `${deleted} message(s) de log supprimé(s).` })],
        });
      }

      if (sub === 'exclude' || sub === 'unexclude') {
        const channel = interaction.options.getChannel('salon', true);
        const list = new Set(config.logExcludedChannels ?? []);
        if (sub === 'exclude') list.add(channel.id);
        else list.delete(channel.id);
        setConfigValue('logExcludedChannels', [...list]);

        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: sub === 'exclude' ? 'Salon exclu' : 'Salon réintégré',
            description: `<#${channel.id}> ${sub === 'exclude' ? 'ne génère plus' : 'génère de nouveau'} de logs.`,
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      return null;
    } catch (err) {
      return fail(interaction, err, 'Action logs impossible.', '/logs');
    }
  },
};

export { isLogEnabled };
