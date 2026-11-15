import { describe, expect, it, vi } from 'vitest';
process.env.META_VERIFY_TOKEN ??= 'test-verify-token'; process.env.META_APP_SECRET ??= 'test-app-secret';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/test'; process.env.REDIS_URL ??= 'redis://localhost:6379'; process.env.API_ADMIN_KEY ??= 'test-admin-key-long-enough';
process.env.META_PAGE_ACCESS_TOKEN ??= 'test-token';
const { post, logger } = vi.hoisted(() => ({ post: vi.fn(), logger: { error: vi.fn() } }));
vi.mock('axios', () => ({ default: { create: () => ({ post }) } }));
vi.mock('../src/utils/logger.js', () => ({ logger }));
const { sendTextMessage } = await import('../src/services/instagram.service.js');
describe('Instagram messaging service', () => {
  it('sends text using the Page messages edge and reports Graph errors without token data', async () => {
    post.mockRejectedValueOnce({ response: { status: 401, data: { error: { code: 190, message: 'Rejected credential test-token' } } } });
    await expect(sendTextMessage('user-1', 'hello')).rejects.toMatchObject({ code: 190, status: 401, message: 'Rejected credential [REDACTED]' });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('test-token');
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/1471732602688156/messages'), { recipient: { id: 'user-1' }, message: { text: 'hello' } }, expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }));
  });
});
