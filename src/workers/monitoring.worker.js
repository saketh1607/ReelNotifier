import { Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

export const monitoringWorker = new Worker('creator-monitoring', async (job) => {
  logger.info({ reelId: job.data.reelId }, 'Creator monitoring integration is not configured; no polling or scraping performed');
}, { connection: redis, concurrency: 2 });
monitoringWorker.on('failed', (job, error) => logger.error({ jobId: job?.id, err: error }, 'Monitoring job failed'));
