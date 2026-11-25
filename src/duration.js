const UNIT_MS = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 7 * 86_400_000,
};

const DURATION_PATTERN = /^(\d{1,5})\s*(s|m|h|d|w)$/i;

export function parseDuration(input) {
  if (!input) return null;
  const value = String(input).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  const match = DURATION_PATTERN.exec(value);
  if (!match) return null;
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const ms = amount * UNIT_MS[unit];
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds >= 86_400) return `${Math.round(seconds / 86_400)} jour(s)`;
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} heure(s)`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} minute(s)`;
  return `${seconds} seconde(s)`;
}

export function formatRemaining(ms) {
  if (ms <= 0) return 'terminé';
  return formatDuration(ms);
}

export function durationLabel(ms) {
  return formatDuration(ms);
}
