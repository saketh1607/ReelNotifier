import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';

const defaults = { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000 };
export const incomingMessageQueue = new Queue('incoming-messages', { connection: redis, defaultJobOptions: defaults });
export const trackingQueue = new Queue('tracking-creation', { connection: redis, defaultJobOptions: defaults });
export const monitoringQueue = new Queue('creator-monitoring', { connection: redis, defaultJobOptions: defaults });
export const notificationQueue = new Queue('notification-delivery', { connection: redis, defaultJobOptions: defaults });
export async function closeQueues() { await Promise.all([incomingMessageQueue, trackingQueue, monitoringQueue, notificationQueue].map((queue) => queue.close())); }
