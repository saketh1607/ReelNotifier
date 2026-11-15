import { prisma } from '../config/database.js';
import { normalizeReelUrl } from '../parsers/reel.parser.js';
import { trackingQueue } from '../queues/index.js';

export async function createTracking({ userId, instagramUserId, originalReelUrl }) {
  const normalized = normalizeReelUrl(originalReelUrl);
  if (!normalized) throw Object.assign(new Error('A valid Instagram Reel URL is required'), { status: 400 });
  let user;
  if (userId) user = await prisma.user.findUnique({ where: { id: userId } });
  else if (instagramUserId) user = await prisma.user.upsert({ where: { instagramUserId }, update: {}, create: { instagramUserId } });
  if (!user) throw Object.assign(new Error('A valid userId or instagramUserId is required'), { status: 400 });
  const tracking = await prisma.reelTracking.create({ data: { userId: user.id, originalReelUrl: normalized.url } });
  await trackingQueue.add('create-tracking', { trackingId: tracking.id }, { jobId: tracking.id });
  return tracking;
}
