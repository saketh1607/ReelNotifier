import { createHash } from 'node:crypto';

function attachmentInfo(attachments = []) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((attachment) => {
    const type = attachment?.type ?? 'unknown';
    const payload = attachment?.payload ?? {};
    const url = payload.url ?? payload.link ?? attachment?.url ?? null;
    return { type, url, title: payload.title ?? null, mediaId: payload.id ?? payload.video_id ?? payload.ig_post_media_id ?? null, raw: attachment };
  });
}

export function parseInstagramWebhook(body) {
  const messages = [];
  if (body?.object !== 'instagram' && body?.object !== 'page') return messages;
  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const message = event.message;
      if (!message || event.message?.is_echo || event.sender?.id == null || event.recipient?.id == null) continue;
      const attachments = attachmentInfo(message.attachments);
      const text = typeof message.text === 'string' ? message.text : null;
      const messageId = message.mid ?? createHash('sha256').update(JSON.stringify({ sender: event.sender.id, recipient: event.recipient.id, timestamp: event.timestamp, message })).digest('hex');
      messages.push({ messageId, senderId: String(event.sender.id), recipientId: String(event.recipient.id), messageText: text, attachmentData: attachments.length ? attachments : undefined, receivedAt: event.timestamp ? new Date(Number(event.timestamp)) : new Date(), reelUrls: [], source: 'messaging' });
    }
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (change.field !== 'messages' || !value?.sender?.id || !value?.recipient?.id || !value?.message) continue;
      const attachments = attachmentInfo(value.message.attachments);
      const message = value.message;
      messages.push({ messageId: message.mid ?? createHash('sha256').update(JSON.stringify(value)).digest('hex'), senderId: String(value.sender.id), recipientId: String(value.recipient.id), messageText: typeof message.text === 'string' ? message.text : null, attachmentData: attachments.length ? attachments : undefined, receivedAt: value.timestamp ? new Date(Number(value.timestamp)) : new Date(), reelUrls: [], source: 'change' });
    }
  }
  return messages;
}
