import { Worker } from 'bullmq';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';
import { createTracking } from '../services/tracking.service.js';
import { extractReelReferences } from '../parsers/webhook.parser.js';
import { logger } from '../utils/logger.js';

export const messageWorker = new Worker('incoming-messages', async (job) => {
  const message = await prisma.incomingMessage.findUnique({ where: { id: job.data.incomingMessageId } });
  if (!message || message.processedAt) return;
  const references = extractReelReferences(message.messageText, Array.isArray(message.attachmentData) ? message.attachmentData : []);
  for (const reference of references) await createTracking({ userId: message.userId, reelReference: reference });
  await prisma.incomingMessage.update({ where: { id: message.id }, data: { processedAt: new Date() } });
}, { connection: redis, concurrency: 10 });
messageWorker.on('failed', (job, error) => logger.error({ jobId: job?.id, err: error }, 'Message job failed'));
