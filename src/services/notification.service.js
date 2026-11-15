import { prisma } from '../config/database.js';

export async function enqueueDetectedReelNotification({ detectedReelId, trackingId }) {
  return prisma.$transaction(async (tx) => {
    const delivery = await tx.notificationDelivery.upsert({
      where: { detectedReelId_trackingId: { detectedReelId, trackingId } },
      update: {},
      create: { detectedReelId, trackingId },
    });
    await tx.outboxEvent.createMany({
      data: [{ eventType: 'notification-delivery', aggregateId: delivery.id, dedupeKey: `notification-delivery:${delivery.id}`, payload: { notificationDeliveryId: delivery.id } }],
      skipDuplicates: true,
    });
    return delivery;
  });
}
