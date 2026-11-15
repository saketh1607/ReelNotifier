import { Worker } from 'bullmq';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';
import { sendReelUrl } from '../services/instagram.service.js';
import { logger } from '../utils/logger.js';

export const notificationWorker = new Worker('notification-delivery', async (job) => {
  const id = job.data.notificationDeliveryId;
  const claimed = await prisma.notificationDelivery.updateMany({ where: { id, status: 'pending' }, data: { status: 'sending' } });
  if (!claimed.count) return;
  const delivery = await prisma.notificationDelivery.findUnique({ where: { id }, include: { tracking: { include: { user: true } }, detectedReel: true } });
  if (!delivery?.detectedReel?.reelUrl || !delivery.tracking?.user?.instagramUserId) {
    await prisma.notificationDelivery.update({ where: { id }, data: { status: 'failed' } });
    return;
  }
  try {
    await sendReelUrl(delivery.tracking.user.instagramUserId, delivery.detectedReel.reelUrl);
    await prisma.notificationDelivery.update({ where: { id }, data: { status: 'sent', sentAt: new Date() } });
  } catch (error) {
    // A definite Graph API response is safe to retry. A timeout/connection error may
    // have succeeded remotely, so keep `sending` to avoid an accidental duplicate DM.
    if (error.isMetaResponse) await prisma.notificationDelivery.update({ where: { id }, data: { status: 'pending' } });
    throw error;
  }
}, { connection: redis, concurrency: 5 });
notificationWorker.on('failed', (job, error) => logger.error({ jobId: job?.id, err: error }, 'Notification job failed'));
