import { describe, expect, it, vi } from 'vitest';
process.env.META_VERIFY_TOKEN ??= 'test-verify-token'; process.env.META_APP_SECRET ??= 'test-app-secret';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/test'; process.env.REDIS_URL ??= 'redis://localhost:6379'; process.env.API_ADMIN_KEY ??= 'test-admin-key-long-enough';
const { prisma, incomingMessageQueue } = vi.hoisted(() => ({
  prisma: { user: { upsert: vi.fn() }, incomingMessage: { create: vi.fn(), findUnique: vi.fn() } },
  incomingMessageQueue: { add: vi.fn() },
}));
vi.mock('../src/config/database.js', () => ({ prisma }));
vi.mock('../src/queues/index.js', () => ({ incomingMessageQueue }));
const { receiveWebhook } = await import('../src/controllers/webhook.controller.js');

describe('webhook database persistence', () => {
  it('stores a message and queues its processing', async () => {
    prisma.user.upsert.mockResolvedValue({ id: 'user-db-id' });
    prisma.incomingMessage.create.mockResolvedValue({ id: 'stored-msg-id' });
    const req = { body: { object: 'instagram', entry: [{ messaging: [{ sender: { id: 'sender-1' }, recipient: { id: 'business-1' }, timestamp: 1000, message: { mid: 'mid-1', text: 'hello' } }] }] } };
    const res = { sendStatus: vi.fn().mockReturnThis() };
    await receiveWebhook(req, res, (error) => { throw error; });
    expect(prisma.incomingMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ messageId: 'mid-1', senderId: 'sender-1', recipientId: 'business-1', messageText: 'hello', userId: 'user-db-id' }) });
    expect(incomingMessageQueue.add).toHaveBeenCalledWith('process-message', { incomingMessageId: 'stored-msg-id', reelUrls: [] }, { jobId: 'stored-msg-id' });
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });
});
