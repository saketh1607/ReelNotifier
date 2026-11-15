import { prisma } from '../config/database.js';
import { parseInstagramWebhook } from '../parsers/webhook.parser.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (env.META_VERIFY_TOKEN && mode === 'subscribe' && typeof token === 'string' && token === env.META_VERIFY_TOKEN && typeof challenge === 'string' && challenge.length < 2048) return res.status(200).type('text/plain').send(challenge);
  return res.sendStatus(403);
}

export async function receiveWebhook(req, res, next) {
  try {
    const messages = parseInstagramWebhook(req.body);
    for (const message of messages) {
      try {
        await prisma.$transaction(async (tx) => {
          const user = await tx.user.upsert({ where: { instagramUserId: message.senderId }, update: {}, create: { instagramUserId: message.senderId } });
          const stored = await tx.incomingMessage.create({ data: { messageId: message.messageId, senderId: message.senderId, recipientId: message.recipientId, messageText: message.messageText, attachmentData: message.attachmentData, receivedAt: message.receivedAt, userId: user.id } });
          await tx.outboxEvent.create({ data: { eventType: 'incoming-message', aggregateId: stored.id, dedupeKey: `incoming-message:${stored.id}`, payload: { incomingMessageId: stored.id } } });
        });
      } catch (error) {
        if (error.code === 'P2002') {
          const duplicate = await prisma.incomingMessage.findUnique({ where: { messageId: message.messageId }, select: { id: true } });
          if (duplicate) continue;
        }
        throw error;
      }
    }
    if (messages.length === 0) logger.debug({ object: req.body?.object, entryCount: req.body?.entry?.length ?? 0 }, 'Acknowledging webhook with no supported incoming message events');
    return res.sendStatus(200);
  } catch (error) {
    logger.error({ err: error }, 'Failed to durably persist Instagram webhook');
    return next(error);
  }
}
