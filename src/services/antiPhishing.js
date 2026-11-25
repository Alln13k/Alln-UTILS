import { getConfig } from '../config.js';
import { log } from '../logger.js';

const KNOWN_PHISHING_HOSTS = [
  'discord-gifts.com',
  'discordgift.store',
  'discord-nitro.com',
  'discordnitrogift.com',
  'free-nitro.ru',
  'nitro-discord.xyz',
  'discord-boost.top',
  'steamcommunity.gift',
  'steamgiftcard.net',
  'giveaway-nitro.com',
  'discord-app.xyz',
  'discord-claim.com',
  'discord-rewards.top',
];

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isKnownPhishing(host) {
  if (!host) return false;
  return KNOWN_PHISHING_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

async function apiCheck(apiUrl, content) {
  if (!apiUrl) return false;
  try {
    const separator = apiUrl.includes('?') ? '&' : '?';
    const url = `${apiUrl}${separator}url=${encodeURIComponent(content.slice(0, 500))}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return false;
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return Boolean(data.malicious || data.phishing || data.isPhishing || data.result === true);
    } catch {
      return /^(true|1|phishing|malicious)$/i.test(text.trim());
    }
  } catch (err) {
    console.error(`[alln-utils] anti-phishing API: ${err.message}`);
    return false;
  }
}

export async function handleAntiPhishing(client, message) {
  if (!message.guild || message.author?.bot) return false;

  const config = getConfig();
  if (!config.antiPhishingEnabled) return false;

  const content = String(message.content ?? '');
  const urls = content.match(URL_PATTERN) ?? [];
  if (urls.length === 0) return false;

  let matched = null;
  for (const url of urls) {
    if (isKnownPhishing(hostOf(url))) {
      matched = url;
      break;
    }
  }

  if (!matched && config.antiPhishingApiUrl) {
    const flagged = await apiCheck(config.antiPhishingApiUrl, content);
    if (flagged) matched = urls[0];
  }

  if (!matched) return false;

  await message.delete().catch(() => null);

  const member = message.member
    ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  const minutes = Math.max(1, Number(config.antiPhishingMuteMinutes) || 60);
  if (member) {
    await member.timeout(minutes * 60_000, 'Anti-phishing — lien malveillant').catch(() => null);
  }

  await log(client, 'automod', 'phishing', {
    guild: message.guild,
    fields: [
      { name: 'Auteur', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
      { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
      { name: 'Lien', value: matched.slice(0, 300), inline: false },
      { name: 'Action', value: `message supprimé — mute ${minutes} min`, inline: true },
    ],
  });

  return true;
}

export const PHISHING_HOSTS = KNOWN_PHISHING_HOSTS;
