import { describe, expect, it } from 'vitest';
import { extractReelUrls, normalizeReelUrl } from '../src/parsers/reel.parser.js';

describe('Reel URL parser', () => {
  it('extracts and normalizes common Reel links', () => {
    expect(extractReelUrls('Part 1 https://instagram.com/reel/Ab_C-2/?igsh=xyz')).toEqual([{ url: 'https://www.instagram.com/reel/Ab_C-2/', shortcode: 'Ab_C-2' }]);
  });
  it('accepts /p links and rejects unrelated URLs', () => {
    expect(normalizeReelUrl('https://www.instagram.com/p/xyz/')).toEqual({ url: 'https://www.instagram.com/reel/xyz/', shortcode: 'xyz' });
    expect(normalizeReelUrl('https://example.com/reel/xyz')).toBeNull();
  });
});
