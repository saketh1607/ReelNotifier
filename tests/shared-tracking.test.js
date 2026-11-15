import { describe, expect, it, vi } from 'vitest';

const { state, prisma, tx } = vi.hoisted(() => {
  const state = { reels: new Map(), subscriptions: new Map(), outboxKeys: new Set(), reelCreateCount: 0 };
  const tx = {
    user: { findUnique: vi.fn(async ({ where }) => ({ id: where.id })) },
    reel: {
      findUnique: vi.fn(async ({ where }) => state.reels.get(where.identity) ?? null),
      create: vi.fn(async ({ data }) => { const reel = { id: `reel-${++state.reelCreateCount}`, ...data }; state.reels.set(data.identity, reel); return reel; }),
      update: vi.fn(),
    },
    reelTracking: { upsert: vi.fn(async ({ where, create }) => {
      const key = `${where.userId_reelId.userId}:${where.userId_reelId.reelId}`;
      if (!state.subscriptions.has(key)) state.subscriptions.set(key, { id: `tracking-${state.subscriptions.size + 1}`, ...create });
      return state.subscriptions.get(key);
    }) },
    outboxEvent: { createMany: vi.fn(async ({ data }) => { for (const event of data) state.outboxKeys.add(event.dedupeKey); return { count: data.length }; }) },
  };
  return { state, tx, prisma: { $transaction: vi.fn((callback) => callback(tx)) } };
});
vi.mock('../src/config/database.js', () => ({ prisma }));
const { createTracking } = await import('../src/services/tracking.service.js');

describe('shared Reel subscriptions', () => {
  it('shares one normalized Reel and monitoring event across users while preserving their subscriptions', async () => {
    const a = await createTracking({ userId: 'user-a', originalReelUrl: 'https://instagram.com/reel/Shared123/?igsh=one' });
    const b = await createTracking({ userId: 'user-b', originalReelUrl: 'https://www.instagram.com/reels/Shared123/' });
    const aAgain = await createTracking({ userId: 'user-a', originalReelUrl: 'https://www.instagram.com/reels/Shared123/' });
    expect(a.reelId).toBe(b.reelId);
    expect(a.id).toBe(aAgain.id);
    expect(state.reelCreateCount).toBe(1);
    expect(state.subscriptions.size).toBe(2);
    expect([...state.outboxKeys].filter((key) => key === `monitor-reel:${a.reelId}`)).toHaveLength(1);
    expect(a.originalReelUrl).toBe('https://www.instagram.com/reel/Shared123/');
  });
});
