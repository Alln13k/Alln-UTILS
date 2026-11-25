import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  deletePinPanel,
  getPinPanel,
  savePinPanel,
} from '../db.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireStaff, replyError } from '../permissions.js';

export function buildPinPanelEmbed(data) {
  return buildEmbed({
    dark: true,
    title: data.title,
    description: data.description,
    fields: data.fields ?? [],
  });
}

function resolveTarget(interaction) {
  const option = interaction.options.getChannel('salon');
  if (option) return option;
  return interaction.channel;
}

async function publish(interaction, channel, data, event) {
  const existing = getPinPanel(channel.id);
  let message = existing?.messageId
    ? await channel.messages.fetch(existing.messageId).catch(() => null)
    : null;

  const payload = { embeds: [buildPinPanelEmbed(data)] };

  if (message) {
    await message.edit(payload).catch(() => null);
  } else {
    message = await channel.send(payload);
  }

  await message.pin(`Panneau épinglé — ${interaction.user.tag}`).catch(() => null);
  savePinPanel(channel.id, { ...data, messageId: message.id, createdBy: interaction.user.id });

  await log(interaction.client, 'pinpanel', event, {
    guild: interaction.guild,
    fields: [
      { name: 'Salon', value: `<#${channel.id}>`, inline: true },
      { name: 'Titre', value: data.title.slice(0, 300), inline: false },
      { name: 'Message', value: message.id, inline: true },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
    ],
  });

  return message;
}

const CHANNEL_OPTION = (opt) => opt
  .setName('salon')
  .setDescription('Salon cible (défaut : salon actuel)')
  .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  .setRequired(false);

export default {
  category: 'Publication',
  description: 'Gère un embed épinglé par salon',
  data: new SlashCommandBuilder()
    .setName('pinpanel')
    .setDescription('Gère un embed épinglé par salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Crée un panneau épinglé')
        .addStringOption((opt) => opt.setName('titre').setDescription('Titre').setMaxLength(200).setRequired(true))
        .addStringOption((opt) => opt.setName('description').setDescription('Description').setMaxLength(3000).setRequired(true))
        .addChannelOption(CHANNEL_OPTION),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Modifie le panneau épinglé du salon')
        .addStringOption((opt) => opt.setName('titre').setDescription('Nouveau titre').setMaxLength(200).setRequired(true))
        .addStringOption((opt) => opt.setName('description').setDescription('Nouvelle description').setMaxLength(3000).setRequired(true))
        .addChannelOption(CHANNEL_OPTION),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Supprime le panneau épinglé du salon')
        .addChannelOption(CHANNEL_OPTION),
    ),

  async execute(interaction) {
    try {
      if (!(await requireStaff(interaction))) return;
      const sub = interaction.options.getSubcommand();
      const channel = resolveTarget(interaction);
      if (!channel?.isTextBased()) return replyError(interaction, 'Salon cible invalide.');

      if (sub === 'remove') {
        const existing = deletePinPanel(channel.id);
        if (!existing) return replyError(interaction, 'Aucun panneau épinglé dans ce salon.');
        const message = await channel.messages.fetch(existing.messageId).catch(() => null);
        if (message) await message.unpin().catch(() => null);
        await log(interaction.client, 'pinpanel', 'edit', {
          guild: interaction.guild,
          title: 'Panneau épinglé supprimé',
          fields: [
            { name: 'Salon', value: `<#${channel.id}>`, inline: true },
            { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
          ],
        });
        return interaction.reply({
          embeds: [buildEmbed({ dark: true, title: 'Panneau supprimé', description: `Panneau retiré de <#${channel.id}>.` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      const title = interaction.options.getString('titre', true);
      const description = interaction.options.getString('description', true);

      if (sub === 'edit' && !getPinPanel(channel.id)) {
        return replyError(interaction, 'Aucun panneau épinglé dans ce salon. Utilise `/pinpanel create`.');
      }

      await publish(interaction, channel, { title, description }, sub === 'edit' ? 'edit' : 'create');

      return interaction.reply({
        embeds: [buildEmbed({
          dark: true,
          title: sub === 'edit' ? 'Panneau modifié' : 'Panneau créé',
          description: `Panneau épinglé dans <#${channel.id}>.`,
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return fail(interaction, err, 'Gestion du panneau impossible.', '/pinpanel');
    }
  },
};

export { resolveTarget, publish };
