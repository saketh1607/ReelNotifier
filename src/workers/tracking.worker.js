import { Worker } from 'bullmq';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

export const trackingWorker = new Worker('tracking-creation', async (job) => {
  const tracking = await prisma.reelTracking.findUnique({ where: { id: job.data.trackingId } });
  if (!tracking) return;
  // No supported creator monitoring integration is implemented in this phase.
  logger.info({ trackingId: tracking.id }, 'Tracking request stored; creator monitoring is not enabled');
}, { connection: redis, concurrency: 5 });
trackingWorker.on('failed', (job, error) => logger.error({ jobId: job?.id, err: error }, 'Tracking job failed'));
