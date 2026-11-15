import { prisma } from '../config/database.js';
import { incomingMessageQueue, trackingQueue, monitoringQueue, notificationQueue } from '../queues/index.js';
import { logger } from '../utils/logger.js';

const BATCH_SIZE = 50;
const MESSAGE_RECOVERY_INTERVAL_MS = 30_000;
const OUTBOX_POLL_INTERVAL_MS = 1_000;

async function enqueueEvent(event) {
  const payload = event.payload ?? {};
  if (event.eventType === 'incoming-message') {
    await incomingMessageQueue.add('process-message', payload, { jobId: `incoming-${payload.incomingMessageId}`, attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
  } else if (event.eventType === 'tracking-subscription') {
    await trackingQueue.add('tracking-subscription', payload, { jobId: `tracking-${payload.trackingId}`, attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
  } else if (event.eventType === 'monitor-reel') {
    await monitoringQueue.add('monitor-reel', payload, { jobId: `monitor-${payload.reelId}`, attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
  } else if (event.eventType === 'notification-delivery') {
    await notificationQueue.add('deliver-notification', payload, { jobId: `notification-${payload.notificationDeliveryId}`, attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
  } else {
    throw new Error(`Unknown outbox event type: ${event.eventType}`);
  }
}

export async function recoverUnprocessedMessages() {
  const messages = await prisma.incomingMessage.findMany({ where: { processedAt: null }, select: { id: true }, take: BATCH_SIZE, orderBy: { receivedAt: 'asc' } });
  for (const message of messages) {
    const jobId = `incoming-${message.id}`;
    const existing = await incomingMessageQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'failed') await existing.retry('failed');
      else if (state === 'completed') await existing.remove();
      else continue;
    }
    await incomingMessageQueue.add('process-message', { incomingMessageId: message.id }, { jobId, attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
  }
}

export async function dispatchOutboxEvent(event) {
  try {
    await enqueueEvent(event);
    await prisma.outboxEvent.update({ where: { id: event.id }, data: { dispatchedAt: new Date(), lockedAt: null, lastError: null } });
    return true;
  } catch (error) {
    await prisma.outboxEvent.update({ where: { id: event.id }, data: { lockedAt: null, lastError: String(error?.message ?? 'Queue dispatch failed').slice(0, 1000) } }).catch((updateError) => logger.error({ eventId: event.id, err: updateError }, 'Could not release outbox event lock'));
    logger.error({ eventId: event.id, eventType: event.eventType, err: error }, 'Outbox dispatch failed; event will be retried');
    return false;
  }
}

async function dispatchBatch() {
  const claimed = await prisma.$transaction((tx) => tx.$queryRaw`
    WITH next_events AS (
      SELECT "id" FROM "OutboxEvent"
      WHERE "dispatchedAt" IS NULL AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - INTERVAL '2 minutes')
      ORDER BY "createdAt"
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "OutboxEvent" AS events
      SET "lockedAt" = NOW(), "attempts" = events."attempts" + 1
      FROM next_events
      WHERE events."id" = next_events."id"
      RETURNING events."id", events."eventType", events."aggregateId", events."payload"
  `);
  for (const event of claimed) await dispatchOutboxEvent(event);
}

let running = false;
let recoveryTimer;
let pollTimer;
export function startOutboxDispatcher() {
  if (running) return;
  running = true;
  const poll = async () => {
    if (!running) return;
    try { await dispatchBatch(); } catch (error) { logger.error({ err: error }, 'Outbox poll failed'); }
    if (running) pollTimer = setTimeout(poll, OUTBOX_POLL_INTERVAL_MS);
  };
  const recover = async () => {
    if (!running) return;
    try { await recoverUnprocessedMessages(); } catch (error) { logger.error({ err: error }, 'Unprocessed message recovery failed'); }
    if (running) recoveryTimer = setTimeout(recover, MESSAGE_RECOVERY_INTERVAL_MS);
  };
  void poll();
  void recover();
}

export function stopOutboxDispatcher() {
  running = false;
  clearTimeout(pollTimer);
  clearTimeout(recoveryTimer);
}
