import { prisma } from '../config/database.js';
import { normalizeReelUrl } from '../parsers/reel.parser.js';

function reelData(reference) {
  const normalized = reference?.url ? normalizeReelUrl(reference.url) : null;
  const shortcode = normalized?.shortcode ?? reference?.shortcode ?? null;
  const mediaId = reference?.mediaId == null ? null : String(reference.mediaId);
  if (!shortcode && !mediaId) throw Object.assign(new Error('A valid Instagram Reel URL or supported Reel media identifier is required'), { status: 400 });
  const identity = shortcode ? `shortcode:${shortcode}` : `media:${mediaId}`;
  return { identity, shortcode, mediaId, canonicalUrl: normalized?.url ?? (shortcode ? `https://www.instagram.com/reel/${shortcode}/` : null) };
}

export async function createTracking({ userId, instagramUserId, originalReelUrl, reelReference }) {
  const identityData = reelData(reelReference ?? { url: originalReelUrl });
  return prisma.$transaction(async (tx) => {
    let user;
    if (userId) user = await tx.user.findUnique({ where: { id: userId } });
    else if (instagramUserId) user = await tx.user.upsert({ where: { instagramUserId }, update: {}, create: { instagramUserId } });
    if (!user) throw Object.assign(new Error('A valid userId or instagramUserId is required'), { status: 400 });

    let reel = await tx.reel.findUnique({ where: { identity: identityData.identity } });
    if (!reel && identityData.mediaId && identityData.shortcode) {
      const byMediaId = await tx.reel.findUnique({ where: { mediaId: identityData.mediaId } });
      if (byMediaId) {
        reel = await tx.reel.update({ where: { id: byMediaId.id }, data: { identity: identityData.identity, shortcode: identityData.shortcode, canonicalUrl: identityData.canonicalUrl } });
      }
    }
    if (!reel) reel = await tx.reel.create({ data: identityData });
    else if (identityData.mediaId && !reel.mediaId) reel = await tx.reel.update({ where: { id: reel.id }, data: { mediaId: identityData.mediaId } });

    const tracking = await tx.reelTracking.upsert({
      where: { userId_reelId: { userId: user.id, reelId: reel.id } },
      update: identityData.canonicalUrl ? { originalReelUrl: identityData.canonicalUrl } : {},
      create: { userId: user.id, reelId: reel.id, originalReelUrl: identityData.canonicalUrl },
      include: { reel: true },
    });

    await tx.outboxEvent.createMany({
      data: [
        { eventType: 'tracking-subscription', aggregateId: tracking.id, dedupeKey: `tracking-subscription:${tracking.id}`, payload: { trackingId: tracking.id } },
        { eventType: 'monitor-reel', aggregateId: reel.id, dedupeKey: `monitor-reel:${reel.id}`, payload: { reelId: reel.id } },
      ],
      skipDuplicates: true,
    });
    return tracking;
  });
}
