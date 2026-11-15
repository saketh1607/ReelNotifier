import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseInstagramWebhook } from '../src/parsers/webhook.parser.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/instagram-message.json', import.meta.url), 'utf8'));

describe('Instagram Reel attachment parsing', () => {
  it('extracts an attachment Reel URL when there is no text URL and preserves its raw payload', () => {
    const [message] = parseInstagramWebhook(fixture);
    expect(message.messageText).toBeNull();
    expect(message.reelReferences).toEqual([expect.objectContaining({ identity: 'shortcode:ABC123', url: 'https://www.instagram.com/reel/ABC123/', mediaId: '18000000000000001', source: 'attachment' })]);
    expect(message.attachmentData[0].raw).toEqual(fixture.entry[0].messaging[0].message.attachments[0]);
  });

  it('uses an available Reel media id when Meta does not include a URL', () => {
    const [, message] = parseInstagramWebhook(fixture);
    expect(message.reelReferences).toEqual([expect.objectContaining({ identity: 'media:18000000000000002', url: null, mediaId: '18000000000000002' })]);
    expect(message.attachmentData[0].url).toBeNull();
  });

  it('keeps unknown attachment metadata but does not misclassify it as a Reel', () => {
    const [message] = parseInstagramWebhook({ object: 'instagram', entry: [{ messaging: [{ sender: { id: 'u' }, recipient: { id: 'b' }, message: { mid: 'm', attachments: [{ type: 'sticker', payload: { id: 'asset-1' } }] } }] }] });
    expect(message.reelReferences).toEqual([]);
    expect(message.attachmentData[0].raw.type).toBe('sticker');
  });

  it('recognizes ig_post as a Reel only when its URL or media product type identifies a Reel', () => {
    const [reelMessage, genericPostMessage] = parseInstagramWebhook({ object: 'instagram', entry: [{ messaging: [
      { sender: { id: 'u1' }, recipient: { id: 'b' }, message: { mid: 'reel-post', attachments: [{ type: 'ig_post', payload: { url: 'https://www.instagram.com/p/Short1/', ig_post_media_id: 'media-1', media_product_type: 'REELS' } }] } },
      { sender: { id: 'u2' }, recipient: { id: 'b' }, message: { mid: 'image-post', attachments: [{ type: 'ig_post', payload: { url: 'https://www.instagram.com/p/Short2/', id: 'media-2' } }] } },
    ] }] });
    expect(reelMessage.reelReferences[0]).toMatchObject({ identity: 'shortcode:Short1', mediaId: 'media-1' });
    expect(genericPostMessage.reelReferences).toEqual([]);
  });
});
