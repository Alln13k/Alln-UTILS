import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getConfig, setConfigValue } from '../config.js';
import { buildEmbed } from '../embeds.js';
import { fail, requireAdmin, replyError } from '../permissions.js';
import { panic } from '../raidMode.js';
import { securityStatus } from '../services/security.js';

export default {
  category: 'Anti-raid',
  description: 'Sécurité anti-raid renforcée',
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Sécurité anti-raid renforcée')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('status').setDescription('État des protections'))
    .addSubcommandGroup((group) =>
      group
        .setName('set')
        .setDescription('Configure les seuils')
        .addSubcommand((sub) =>
          sub
            .setName('joinrate')
            .setDescription('Seuil de joins massifs')
            .addIntegerOption((opt) => opt.setName('joins').setDescription('Joins max').setMinValue(2).setMaxValue(200).setRequired(true))
            .addIntegerOption((opt) => opt.setName('secondes').setDescription('Fenêtre en secondes').setMinValue(2).setMaxValue(300).setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('newaccountdays')
            .setDescription('Âge minimum avant lien autorisé')
            .addIntegerOption((opt) => opt.setName('jours').setDescription('Jours').setMinValue(1).setMaxValue(90).setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('raidaction')
            .setDescription('Action contre les comptes récents')
            .addStringOption((opt) =>
              opt.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'Kick', value: 'kick' }, { name: 'Ban', value: 'ban' }),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('panic')
        .setDescription('Verrouille tout le serveur et alerte le staff')
        .addStringOption((opt) => opt.setName('confirmation').setDescription('Écris CONFIRM pour valider').setMaxLength(16).setRequired(true)),
    ),

  async execute(interaction) {
    try {
      if (!(await requireAdmin(interaction))) return;

      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand();

      if (!group && sub === 'status') {
        const status = securityStatus();
        return interaction.reply({
          embeds: [buildEmbed({
            dark: true,
            title: 'Sécurité',
            fields: [
              { name: 'Raid mode', value: status.raidModeEnabled ? '✅ actif' : '❌ inactif', inline: true },
              { name: 'Seuil de joins', value: status.joinRate, inline: true },
              { name: 'Comptes récents', value: `< ${status.newAccountDays} jour(s)`, inline: true },
              { name: 'Action comptes récents', value: status.raidAction, inline: true },
              { name: 'Automod', value: status.automod ? '✅ actif' : '❌ inactif', inline: true },
              { name: 'Raid trap', value: status.raidTrap ? '✅ actif' : '❌ inactif', inline: true },
              { name: 'Salons verrouillés', value: String(status.lockedChannels), inline: true },
            ],
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (group === 'set' && sub === 'joinrate') {
        setConfigValue('securityJoinRateCount', interaction.options.getInteger('joins', true));
        setConfigValue('securityJoinRateWindow', interaction.options.getInteger('secondes', true));
      } else if (group === 'set' && sub === 'newaccountdays') {
        setConfigValue('securityNewAccountDays', interaction.options.getInteger('jours', true));
      } else if (group === 'set' && sub === 'raidaction') {
        setConfigValue('securityRaidAction', interaction.options.getString('action', true));
      } else if (!group && sub === 'panic') {
        const confirmation = interaction.options.getString('confirmation', true).trim();
        if (confirmation !== 'CONFIRM') return replyError(interaction, 'Confirmation invalide. Écris exactement `CONFIRM`.');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const count = await panic(interaction.client, interaction.guild, { by: interaction.user.id });
        return interaction.editReply({
          embeds: [buildEmbed({
            dark: true,
            title: 'PANIC activé',
            description: `${count} salon(s) verrouillé(s). Le propriétaire a été notifié et le staff pingé.`,
          })],
        });
      } else {
        return replyError(interaction, 'Sous-commande inconnue.');
      }

      const config = getConfig();
      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: 'Sécurité mise à jour',
          fields: [
            { name: 'Joins', value: `${config.securityJoinRateCount} / ${config.securityJoinRateWindow}s`, inline: true },
            { name: 'Comptes récents', value: `< ${config.securityNewAccountDays} jour(s)`, inline: true },
            { name: 'Action', value: config.securityRaidAction, inline: true },
          ],
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Action sécurité impossible.', '/security');
    }
  },
};
