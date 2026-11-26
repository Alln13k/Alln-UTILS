const sessions = new Map();
const MAX_SESSIONS = 500;

export function createConfigSession(messageId, userId) {
  if (!messageId || !userId) return;
  sessions.set(messageId, userId);
  if (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    sessions.delete(oldest);
  }
}

export function configSessionOwner(interaction) {
  const messageId = interaction.message?.id;
  if (messageId && sessions.has(messageId)) return sessions.get(messageId);
  return interaction.message?.interaction?.user?.id
    ?? interaction.message?.interactionMetadata?.user?.id
    ?? null;
}

export function deleteConfigSession(messageId) {
  sessions.delete(messageId);
}
