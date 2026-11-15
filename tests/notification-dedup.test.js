import { describe, expect, it, vi } from 'vitest';
const { prisma, tx } = vi.hoisted(() => {
  const delivery = { id: 'delivery-1', detectedReelId: 'detected-1', trackingId: 'tracking-1', status: 'pending' };
  const tx = {
    notificationDelivery: { upsert: vi.fn().mockResolvedValue(delivery) },
    outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return { tx, prisma: { $transaction: vi.fn((callback) => callback(tx)) } };
});
vi.mock('../src/config/database.js', () => ({ prisma }));
const { enqueueDetectedReelNotification } = await import('../src/services/notification.service.js');

describe('notification idempotency', () => {
  it('uses the detected Reel and subscription pair as a unique delivery and outbox key', async () => {
    const first = await enqueueDetectedReelNotification({ detectedReelId: 'detected-1', trackingId: 'tracking-1' });
    const duplicate = await enqueueDetectedReelNotification({ detectedReelId: 'detected-1', trackingId: 'tracking-1' });
    expect(first).toBe(duplicate);
    expect(tx.notificationDelivery.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { detectedReelId_trackingId: { detectedReelId: 'detected-1', trackingId: 'tracking-1' } } }));
    expect(tx.outboxEvent.createMany).toHaveBeenCalledWith({ data: [{ eventType: 'notification-delivery', aggregateId: 'delivery-1', dedupeKey: 'notification-delivery:delivery-1', payload: { notificationDeliveryId: 'delivery-1' } }], skipDuplicates: true });
  });
});
