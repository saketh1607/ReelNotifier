import { createHash } from 'node:crypto';
import { extractReelUrls, normalizeReelUrl } from './reel.parser.js';

const REEL_ATTACHMENT_TYPES = new Set(['ig_reel', 'reel']);

function attachmentInfo(attachments = []) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((attachment) => {
    const payload = attachment?.payload && typeof attachment.payload === 'object' ? attachment.payload : {};
    return {
      type: typeof attachment?.type === 'string' ? attachment.type : 'unknown',
      url: attachment?.url ?? payload.url ?? payload.link ?? null,
      title: attachment?.title ?? payload.title ?? null,
      mediaId: attachment?.mediaId ?? payload.video_id ?? payload.ig_post_media_id ?? payload.id ?? attachment?.ig_post_media_id ?? null,
      mediaProductType: attachment?.mediaProductType ?? payload.media_product_type ?? attachment?.media_product_type ?? null,
      raw: attachment?.raw ?? attachment,
    };
  });
}

export function extractReelReferences(text, storedAttachments = []) {
  const attachments = attachmentInfo(storedAttachments);
  const references = new Map();
  for (const link of extractReelUrls(text ?? '')) references.set(`shortcode:${link.shortcode}`, { ...link, identity: `shortcode:${link.shortcode}`, mediaId: null, source: 'text' });
  for (const attachment of attachments) {
    const productIsReel = ['REEL', 'REELS'].includes(String(attachment.mediaProductType).toUpperCase());
    const normalized = normalizeReelUrl(attachment.url, { allowPostPath: attachment.type === 'ig_post' && productIsReel });
    const explicitReelPost = attachment.type === 'ig_post' && (normalized || productIsReel);
    if (!REEL_ATTACHMENT_TYPES.has(attachment.type) && !explicitReelPost) continue;
    const mediaId = attachment.mediaId == null ? null : String(attachment.mediaId);
    const identity = normalized ? `shortcode:${normalized.shortcode}` : mediaId ? `media:${mediaId}` : null;
    if (!identity) continue;
    references.set(identity, {
      url: normalized?.url ?? null,
      shortcode: normalized?.shortcode ?? null,
      mediaId,
      identity,
      type: attachment.type,
      title: attachment.title,
      source: 'attachment',
    });
  }
  return [...references.values()];
}

function parseMessage(sender, recipient, timestamp, message, isEcho = false) {
  if (!message || isEcho || message.is_echo || sender?.id == null || recipient?.id == null) return null;
  const attachments = attachmentInfo(message.attachments);
  const text = typeof message.text === 'string' ? message.text : null;
  const messageId = message.mid ?? createHash('sha256').update(JSON.stringify({ sender: sender.id, recipient: recipient.id, timestamp, message })).digest('hex');
  return {
    messageId,
    senderId: String(sender.id),
    recipientId: String(recipient.id),
    messageText: text,
    attachmentData: attachments.length ? attachments : undefined,
    reelReferences: extractReelReferences(text, attachments),
    receivedAt: timestamp ? new Date(Number(timestamp)) : new Date(),
  };
}

export function parseInstagramWebhook(body) {
  const messages = [];
  if (!body || !['instagram', 'page'].includes(body.object) || !Array.isArray(body.entry)) return messages;
  for (const entry of body.entry) {
    for (const event of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      const parsed = parseMessage(event?.sender, event?.recipient, event?.timestamp, event?.message, event?.message?.is_echo);
      if (parsed) messages.push(parsed);
    }
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      if (change?.field !== 'messages') continue;
      const parsed = parseMessage(value?.sender, value?.recipient, value?.timestamp, value?.message, value?.message?.is_echo || value?.is_echo);
      if (parsed) messages.push(parsed);
    }
  }
  return messages;
}
