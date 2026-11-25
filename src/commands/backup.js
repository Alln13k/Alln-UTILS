import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import archiver from 'archiver';
import { AttachmentBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { DATA_DIR } from '../store.js';
import { buildEmbed } from '../embeds.js';
import { log } from '../logger.js';
import { fail, requireAdmin, replyError } from '../permissions.js';

function buildArchive() {
  const file = path.join(os.tmpdir(), `alln-utils-backup-${Date.now()}.zip`);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(file);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(file));
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(DATA_DIR, 'data');
    archive.finalize();
  });
}

export default {
  category: 'Administration',
  description: 'Archive data/ et l\'envoie en DM au propriétaire',
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Archive data/ et l\'envoie en DM au propriétaire')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    try {
      if (!(await requireAdmin(interaction))) return;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const owner = await interaction.client.users.fetch(interaction.guild.ownerId).catch(() => null);
      if (!owner) return replyError(interaction, 'Propriétaire du serveur introuvable.');

      const file = await buildArchive();
      const size = fs.statSync(file).size;

      try {
        await owner.send({
          embeds: [buildEmbed({
            dark: true,
            title: 'Backup — Alln UTILS',
            description: `Sauvegarde du serveur **${interaction.guild.name}**.\nDemandée par <@${interaction.user.id}>.`,
            fields: [{ name: 'Taille', value: `${(size / 1024).toFixed(1)} Ko`, inline: true }],
          })],
          files: [new AttachmentBuilder(file, { name: `alln-utils-backup-${Date.now()}.zip` })],
        });
      } finally {
        fs.unlink(file, () => null);
      }

      await log(interaction.client, 'admin', 'backup', {
        guild: interaction.guild,
        fields: [
          { name: 'Taille', value: `${(size / 1024).toFixed(1)} Ko`, inline: true },
          { name: 'Envoyé à', value: `${owner.tag} (${owner.id})`, inline: true },
          { name: 'Par', value: `<@${interaction.user.id}>`, inline: true },
        ],
      });

      return interaction.editReply({
        embeds: [buildEmbed({ dark: true, title: 'Backup envoyé', description: `Archive envoyée en DM à **${owner.tag}**.` })],
      });
    } catch (err) {
      return fail(interaction, err, 'Backup impossible. Vérifie que tes DM sont ouverts côté owner.', '/backup');
    }
  },
};
