import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
process.env.META_VERIFY_TOKEN ??= 'test-verify-token';
process.env.META_APP_SECRET ??= 'test-app-secret';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.API_ADMIN_KEY ??= 'test-admin-key-long-enough';
const { parseInstagramWebhook } = await import('../src/parsers/webhook.parser.js');
const { verifyWebhook, receiveWebhook } = await import('../src/controllers/webhook.controller.js');
const { validateMetaSignature } = await import('../src/middleware/signature.middleware.js');

function response() { return { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, type() { return this; }, send(body) { this.body = body; return this; }, sendStatus(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
describe('Instagram webhook', () => {
  it('verifies correct challenge', () => { const res = response(); verifyWebhook({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'test-verify-token', 'hub.challenge': 'abc' } }, res); expect(res.statusCode).toBe(200); expect(res.body).toBe('abc'); });
  it('rejects incorrect verify token', () => { const res = response(); verifyWebhook({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'abc' } }, res); expect(res.statusCode).toBe(403); });
  it('rejects invalid signature and accepts valid signature', () => {
    const body = Buffer.from('{"object":"instagram"}');
    const req = { rawBody: body, get: () => 'sha256=bad' };
    const res = response(); validateMetaSignature(req, res, vi.fn()); expect(res.statusCode).toBe(401);
    const signature = createHmac('sha256', 'test-app-secret').update(body).digest('hex');
    const next = vi.fn(); validateMetaSignature({ ...req, get: () => `sha256=${signature}` }, response(), next); expect(next).toHaveBeenCalledOnce();
  });
  it('parses text, shared Reel metadata, and unsupported attachments safely', () => {
    const parsed = parseInstagramWebhook({ object: 'instagram', entry: [{ messaging: [{ sender: { id: 'u' }, recipient: { id: 'b' }, timestamp: 1000, message: { mid: 'm1', text: 'hello', attachments: [{ type: 'ig_reel', payload: { url: 'https://instagram.com/reel/x/' } }, { type: 'unknown' }] } }] }] });
    expect(parsed[0].messageText).toBe('hello'); expect(parsed[0].attachmentData).toHaveLength(2); expect(parsed[0].attachmentData[1].url).toBeNull();
  });
  it('deduplicates equivalent messages by stable fallback id', () => {
    const event = { object: 'instagram', entry: [{ messaging: [{ sender: { id: 'u' }, recipient: { id: 'b' }, timestamp: 1, message: { text: 'x' } }] }] };
    expect(parseInstagramWebhook(event)[0].messageId).toBe(parseInstagramWebhook(event)[0].messageId);
  });
  it('ignores echo and unsupported webhook events without treating them as user DMs', () => {
    expect(parseInstagramWebhook({ object: 'instagram', entry: [{ messaging: [{ sender: { id: 'business' }, recipient: { id: 'user' }, message: { mid: 'echo', is_echo: true, text: 'sent by us' } }], changes: [{ field: 'comments', value: { id: 'comment-1' } }] }] })).toEqual([]);
    expect(parseInstagramWebhook({ object: 'instagram', entry: [{ changes: [{ field: 'messages', value: { sender: { id: 'business' }, recipient: { id: 'user' }, message: { mid: 'echo-2', is_echo: true, text: 'sent by us' } } }] }] })).toEqual([]);
    expect(parseInstagramWebhook({ object: 'instagram', entry: [{ messaging: { malformed: true } }] })).toEqual([]);
  });
});
