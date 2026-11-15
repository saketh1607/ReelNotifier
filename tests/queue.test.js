import { beforeEach, describe, expect, it, vi } from 'vitest';
process.env.META_VERIFY_TOKEN ??= 'test-verify-token'; process.env.META_APP_SECRET ??= 'test-app-secret';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/test'; process.env.REDIS_URL ??= 'redis://localhost:6379'; process.env.API_ADMIN_KEY ??= 'test-admin-key-long-enough';

const { prisma, queues } = vi.hoisted(() => ({
  prisma: { outboxEvent: { update: vi.fn() }, incomingMessage: { findMany: vi.fn() } },
  queues: {
    incomingMessageQueue: { add: vi.fn(), getJob: vi.fn() },
    trackingQueue: { add: vi.fn() },
    monitoringQueue: { add: vi.fn() },
    notificationQueue: { add: vi.fn() },
  },
}));
vi.mock('../src/config/database.js', () => ({ prisma }));
vi.mock('../src/queues/index.js', () => queues);
const { dispatchOutboxEvent, recoverUnprocessedMessages } = await import('../src/workers/outbox.dispatcher.js');

describe('transactional outbox dispatch and recovery', () => {
  beforeEach(() => { vi.clearAllMocks(); prisma.outboxEvent.update.mockResolvedValue({}); });

  it('uses bounded retries with exponential backoff', async () => {
    const fs = await import('node:fs/promises');
    const source = await fs.readFile(new URL('../src/queues/index.js', import.meta.url), 'utf8');
    expect(source).toContain('attempts: 5'); expect(source).toContain("type: 'exponential'");
  });

  it('leaves failed queue publishes undispatched and retries the durable outbox row', async () => {
    const event = { id: 'outbox-1', eventType: 'incoming-message', payload: { incomingMessageId: 'message-1' } };
    queues.incomingMessageQueue.add.mockRejectedValueOnce(new Error('Redis unavailable')).mockResolvedValueOnce({ id: 'incoming-message-1' });
    expect(await dispatchOutboxEvent(event)).toBe(false);
    expect(prisma.outboxEvent.update).toHaveBeenLastCalledWith({ where: { id: 'outbox-1' }, data: { lockedAt: null, lastError: 'Redis unavailable' } });
    expect(await dispatchOutboxEvent(event)).toBe(true);
    expect(queues.incomingMessageQueue.add).toHaveBeenNthCalledWith(2, 'process-message', { incomingMessageId: 'message-1' }, expect.objectContaining({ jobId: 'incoming-message-1' }));
    expect(prisma.outboxEvent.update).toHaveBeenLastCalledWith({ where: { id: 'outbox-1' }, data: { dispatchedAt: expect.any(Date), lockedAt: null, lastError: null } });
  });

  it('requeues messages with no active BullMQ job after a worker failure or lost job', async () => {
    prisma.incomingMessage.findMany.mockResolvedValue([{ id: 'lost-message' }, { id: 'failed-message' }]);
    const failedJob = { getState: vi.fn().mockResolvedValue('failed'), retry: vi.fn().mockResolvedValue(undefined) };
    queues.incomingMessageQueue.getJob.mockResolvedValueOnce(null).mockResolvedValueOnce(failedJob);
    await recoverUnprocessedMessages();
    expect(queues.incomingMessageQueue.add).toHaveBeenCalledWith('process-message', { incomingMessageId: 'lost-message' }, expect.objectContaining({ jobId: 'incoming-lost-message' }));
    expect(failedJob.retry).toHaveBeenCalledWith('failed');
  });

  it('uses a deterministic queue job id for notifications so duplicate outbox delivery cannot enqueue another DM', async () => {
    queues.notificationQueue.add.mockResolvedValue({ id: 'notification-job' });
    await dispatchOutboxEvent({ id: 'notify-event', eventType: 'notification-delivery', payload: { notificationDeliveryId: 'delivery-1' } });
    expect(queues.notificationQueue.add).toHaveBeenCalledWith('deliver-notification', { notificationDeliveryId: 'delivery-1' }, expect.objectContaining({ jobId: 'notification-delivery-1' }));
  });
});
