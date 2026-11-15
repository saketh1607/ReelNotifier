const REEL_URL_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels)\/([A-Za-z0-9_-]+)\/?(?:\?[^\s]*)?/gi;

export function extractReelUrls(text = '') {
  if (typeof text !== 'string') return [];
  const matches = [];
  for (const match of text.matchAll(REEL_URL_RE)) {
    const shortcode = match[1];
    matches.push({ url: `https://www.instagram.com/reel/${shortcode}/`, shortcode });
  }
  return [...new Map(matches.map((item) => [item.shortcode, item])).values()];
}

export function normalizeReelUrl(input, { allowPostPath = false } = {}) {
  if (typeof input !== 'string') return null;
  const pathKinds = allowPostPath ? '(?:reel|reels|p)' : '(?:reel|reels)';
  const match = input.match(new RegExp(`^https?:\\/\\/(?:www\\.)?instagram\\.com\\/${pathKinds}\\/([A-Za-z0-9_-]+)\\/?(?:\\?[^\\s]*)?$`, 'i'));
  return match ? { url: `https://www.instagram.com/reel/${match[1]}/`, shortcode: match[1] } : null;
}
