import { Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import { sendTextMessage } from '../services/instagram.service.js';
import { logger } from '../utils/logger.js';

export const notificationWorker = new Worker('notification-delivery', async (job) => {
  return sendTextMessage(job.data.recipientId, job.data.text);
}, { connection: redis, concurrency: 5 });
notificationWorker.on('failed', (job, error) => logger.error({ jobId: job?.id, err: error }, 'Notification job failed'));
