import { prisma } from '../config/database.js';
import { incomingMessageQueue } from '../queues/index.js';
import { parseInstagramWebhook } from '../parsers/webhook.parser.js';
import { extractReelUrls } from '../parsers/reel.parser.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && typeof token === 'string' && token === env.META_VERIFY_TOKEN && typeof challenge === 'string' && challenge.length < 2048) return res.status(200).type('text/plain').send(challenge);
  return res.sendStatus(403);
}

export async function receiveWebhook(req, res, next) {
  try {
    const messages = parseInstagramWebhook(req.body);
    for (const message of messages) message.reelUrls = extractReelUrls(message.messageText ?? '');
    for (const message of messages) {
      const user = await prisma.user.upsert({ where: { instagramUserId: message.senderId }, update: {}, create: { instagramUserId: message.senderId } });
      try {
        const stored = await prisma.incomingMessage.create({ data: { messageId: message.messageId, senderId: message.senderId, recipientId: message.recipientId, messageText: message.messageText, attachmentData: message.attachmentData, receivedAt: message.receivedAt, userId: user.id } });
        await incomingMessageQueue.add('process-message', { incomingMessageId: stored.id, reelUrls: message.reelUrls }, { jobId: stored.id });
      } catch (error) {
        if (error.code === 'P2002') {
          const stored = await prisma.incomingMessage.findUnique({ where: { messageId: message.messageId } });
          if (stored && !stored.processedAt) await incomingMessageQueue.add('process-message', { incomingMessageId: stored.id, reelUrls: message.reelUrls }, { jobId: stored.id });
          continue;
        }
        throw error;
      }
    }
    return res.sendStatus(200);
  } catch (error) {
    logger.error({ err: error }, 'Failed to persist Instagram webhook');
    return next(error);
  }
}
