import { listAllWarns, listPayments, listTickets } from './db.js';

function escapeCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  return `\uFEFF${headers.map(escapeCell).join(',')}\n${rows.map((row) => row.map(escapeCell).join(',')).join('\n')}\n`;
}

export function buildExport(kind) {
  if (kind === 'tickets') {
    const rows = listTickets().map((ticket) => [
      ticket.id,
      ticket.channelId,
      ticket.userId,
      ticket.username,
      ticket.category,
      ticket.subject,
      ticket.status,
      ticket.priority,
      ticket.createdAt,
      ticket.closedAt,
      ticket.closeReason,
    ]);
    return {
      filename: `alln-tickets-${Date.now()}.csv`,
      content: toCsv(['id', 'channelId', 'userId', 'username', 'category', 'subject', 'status', 'priority', 'createdAt', 'closedAt', 'closeReason'], rows),
    };
  }

  if (kind === 'warns') {
    const rows = listAllWarns().map((warn) => [
      warn.userId,
      warn.moderator,
      warn.reason,
      warn.type,
      warn.createdAt,
    ]);
    return {
      filename: `alln-warns-${Date.now()}.csv`,
      content: toCsv(['userId', 'moderator', 'reason', 'type', 'createdAt'], rows),
    };
  }

  if (kind === 'payments') {
    const rows = listPayments().map((payment) => [
      payment.id,
      payment.userId,
      payment.username,
      payment.amount,
      payment.method,
      payment.note,
      payment.createdBy,
      payment.createdAt,
    ]);
    return {
      filename: `alln-payments-${Date.now()}.csv`,
      content: toCsv(['id', 'userId', 'username', 'amount', 'method', 'note', 'createdBy', 'createdAt'], rows),
    };
  }

  throw new Error(`export inconnu: ${kind}`);
}

export { toCsv };
