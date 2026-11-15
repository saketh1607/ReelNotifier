import { describe, expect, it } from 'vitest';
describe('queue retry policy', () => {
  it('uses bounded retries with exponential backoff', async () => {
    const fs = await import('node:fs/promises');
    const source = await fs.readFile(new URL('../src/queues/index.js', import.meta.url), 'utf8');
    expect(source).toContain('attempts: 5'); expect(source).toContain("type: 'exponential'");
  });
});
