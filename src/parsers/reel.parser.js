const REEL_URL_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)\/?(?:\?[^\s]*)?/gi;

export function extractReelUrls(text = '') {
  if (typeof text !== 'string') return [];
  const matches = [];
  for (const match of text.matchAll(REEL_URL_RE)) {
    const shortcode = match[1];
    matches.push({ url: `https://www.instagram.com/reel/${shortcode}/`, shortcode });
  }
  return [...new Map(matches.map((item) => [item.shortcode, item])).values()];
}

export function normalizeReelUrl(input) {
  if (typeof input !== 'string') return null;
  const match = input.match(/^https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)\/?(?:\?[^\s]*)?$/i);
  return match ? { url: `https://www.instagram.com/reel/${match[1]}/`, shortcode: match[1] } : null;
}
