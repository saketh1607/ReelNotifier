import { messageWorker } from './message.worker.js';
import { trackingWorker } from './tracking.worker.js';
import { monitoringWorker } from './monitoring.worker.js';
import { notificationWorker } from './notification.worker.js';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const workers = [messageWorker, trackingWorker, monitoringWorker, notificationWorker];
logger.info('ReelNotifier workers started');
async function shutdown(signal) {
  logger.info({ signal }, 'Stopping workers');
  await Promise.allSettled(workers.map((worker) => worker.close()));
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
