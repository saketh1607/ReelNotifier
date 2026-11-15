import { beforeEach, describe, expect, it, vi } from 'vitest';
process.env.META_VERIFY_TOKEN ??= 'test-verify-token'; process.env.META_APP_SECRET ??= 'test-app-secret';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/test'; process.env.REDIS_URL ??= 'redis://localhost:6379'; process.env.API_ADMIN_KEY ??= 'test-admin-key-long-enough';

const { prisma, tx } = vi.hoisted(() => {
  const tx = { user: { upsert: vi.fn() }, incomingMessage: { create: vi.fn() }, outboxEvent: { create: vi.fn() } };
  return { tx, prisma: { $transaction: vi.fn((callback) => callback(tx)), incomingMessage: { findUnique: vi.fn() } } };
});
vi.mock('../src/config/database.js', () => ({ prisma }));
const { receiveWebhook } = await import('../src/controllers/webhook.controller.js');

function request(body) { return { body }; }
function response() { return { sendStatus: vi.fn().mockReturnThis() }; }
function messageBody(mid = 'mid-1') { return { object: 'instagram', entry: [{ messaging: [{ sender: { id: 'sender-1' }, recipient: { id: 'business-1' }, timestamp: 1000, message: { mid, text: 'hello' } }] }] }; }

describe('webhook durable persistence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists the message and outbox event in one transaction before acknowledging', async () => {
    tx.user.upsert.mockResolvedValue({ id: 'user-db-id' });
    tx.incomingMessage.create.mockResolvedValue({ id: 'stored-msg-id' });
    tx.outboxEvent.create.mockResolvedValue({ id: 'outbox-id' });
    const res = response();
    await receiveWebhook(request(messageBody()), res, (error) => { throw error; });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.incomingMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ messageId: 'mid-1', senderId: 'sender-1', recipientId: 'business-1', messageText: 'hello', userId: 'user-db-id' }) });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ eventType: 'incoming-message', aggregateId: 'stored-msg-id', dedupeKey: 'incoming-message:stored-msg-id', payload: { incomingMessageId: 'stored-msg-id' } }) });
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  it('does not create another message or outbox event for a duplicate webhook', async () => {
    tx.user.upsert.mockResolvedValue({ id: 'user-db-id' });
    tx.incomingMessage.create.mockResolvedValueOnce({ id: 'stored-msg-id' }).mockRejectedValueOnce({ code: 'P2002' });
    prisma.incomingMessage.findUnique.mockResolvedValue({ id: 'stored-msg-id' });
    tx.outboxEvent.create.mockResolvedValue({ id: 'outbox-id' });
    const res = response();
    await receiveWebhook(request(messageBody()), res, (error) => { throw error; });
    await receiveWebhook(request(messageBody()), res, (error) => { throw error; });
    expect(tx.incomingMessage.create).toHaveBeenCalledTimes(2);
    expect(tx.outboxEvent.create).toHaveBeenCalledOnce();
    expect(res.sendStatus).toHaveBeenCalledTimes(2);
  });

  it('does not acknowledge if the durable transaction fails', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('database unavailable'));
    const res = response(); const next = vi.fn();
    await receiveWebhook(request(messageBody()), res, next);
    expect(res.sendStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'database unavailable' }));
  });

  it('does not mistake a concurrent sender upsert conflict for a duplicate message', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    prisma.incomingMessage.findUnique.mockResolvedValueOnce(null);
    const res = response(); const next = vi.fn();
    await receiveWebhook(request(messageBody('different-message')), res, next);
    expect(res.sendStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'P2002' }));
  });
});
