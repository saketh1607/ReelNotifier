import { describe, expect, it } from 'vitest';

process.env.META_PAGE_ACCESS_TOKEN = 'page-token-for-test-only';
process.env.META_VERIFY_TOKEN ??= 'verify-token-for-test';
process.env.META_APP_SECRET ??= 'app-secret-for-test';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.API_ADMIN_KEY ??= 'test-admin-key-long-enough';

const { env } = await import('../src/config/env.js');

describe('Meta Page Access Token configuration', () => {
  it('reads META_PAGE_ACCESS_TOKEN and does not expose the old ambiguous setting', () => {
    expect(env.META_PAGE_ACCESS_TOKEN).toBe('page-token-for-test-only');
    expect(env).not.toHaveProperty('META_ACCESS_TOKEN');
  });
});
