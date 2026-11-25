import { EmbedBuilder } from 'discord.js';
import { getConfig } from './config.js';

export function buildEmbed({
  title,
  description,
  fields,
  image,
  thumbnail,
  url,
  author,
  footer,
  color,
  dark = false,
  timestamp = true,
} = {}) {
  const config = getConfig();
  const embed = new EmbedBuilder().setColor(color ?? (dark ? config.embedColorDark : config.embedColor));

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields?.length) embed.addFields(fields.filter((f) => f && f.name && f.value !== undefined && f.value !== null));
  if (image) embed.setImage(image);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (url) embed.setURL(url);
  if (author) embed.setAuthor(author);
  if (timestamp) embed.setTimestamp(new Date());

  embed.setFooter({ text: footer ?? (dark ? config.footerDark : config.footer) });

  return embed;
}

export function buildDark(data = {}) {
  return buildEmbed({ ...data, dark: true });
}

export function buildError(description) {
  return buildDark({ title: 'Erreur', description });
}

export function buildSuccess(title, description) {
  return buildDark({ title, description });
}
