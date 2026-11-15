import { Worker } from 'bullmq';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';
import { createTracking } from '../services/tracking.service.js';
import { logger } from '../utils/logger.js';

export const messageWorker = new Worker('incoming-messages', async (job) => {
  const message = await prisma.incomingMessage.findUnique({ where: { id: job.data.incomingMessageId } });
  if (!message || message.processedAt) return;
  for (const reel of job.data.reelUrls ?? []) {
    const exists = await prisma.reelTracking.findFirst({ where: { userId: message.userId, originalReelUrl: reel.url, status: { in: ['pending', 'monitoring', 'part_found'] } } });
    if (!exists) await createTracking({ userId: message.userId, originalReelUrl: reel.url });
  }
  await prisma.incomingMessage.update({ where: { id: message.id }, data: { processedAt: new Date() } });
}, { connection: redis, concurrency: 10 });
messageWorker.on('failed', (job, error) => logger.error({ jobId: job?.id, err: error }, 'Message job failed'));
