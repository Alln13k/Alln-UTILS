const MAX_MESSAGES = 2000;

function formatDate(value) {
  try {
    return new Date(value).toISOString().replace('T', ' ').slice(0, 19);
  } catch {
    return 'date inconnue';
  }
}

export async function collectMessages(channel) {
  const collected = [];
  let before;
  let guard = 0;

  while (collected.length < MAX_MESSAGES && guard < 40) {
    guard += 1;
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;

    collected.push(...batch.values());
    before = batch.last().id;

    if (batch.size < 100) break;
  }

  return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

export async function createTranscript(channel, ticket) {
  const messages = await collectMessages(channel);

  const lines = [
    '==================================================',
    `TRANSCRIPT — TICKET #${ticket.id}`,
    '==================================================',
    `Salon        : #${channel.name} (${channel.id})`,
    `Ouvert par   : ${ticket.username ?? ticket.userId}`,
    `Catégorie    : ${ticket.category}`,
    `Sujet        : ${ticket.subject}`,
    `Ouvert le    : ${formatDate(ticket.createdAt)}`,
    `Fermé le     : ${formatDate(ticket.closedAt ?? new Date())}`,
    `Fermé par    : ${ticket.closedBy ?? 'inconnu'}`,
    `Raison       : ${ticket.closeReason ?? 'non précisée'}`,
    `Messages     : ${messages.length}`,
    '==================================================',
    '',
  ];

  for (const message of messages) {
    const author = message.author?.tag ?? message.author?.username ?? 'inconnu';
    const content = message.content?.trim() ? message.content : message.embeds.length ? '[embed]' : '';
    lines.push(`[${formatDate(message.createdTimestamp)}] ${author}: ${content}`);

    if (message.attachments.size > 0) {
      for (const attachment of message.attachments.values()) {
        lines.push(`    [pièce jointe] ${attachment.name} — ${attachment.url}`);
      }
    }
  }

  const buffer = Buffer.from(lines.join('\n'), 'utf8');
  return { name: `transcript-ticket-${ticket.id}.txt`, buffer };
}
