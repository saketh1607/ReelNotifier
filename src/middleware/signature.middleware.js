import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

export function validateMetaSignature(req, res, next) {
  const header = req.get('x-hub-signature-256');
  const rawBody = req.rawBody;
  if (!env.META_APP_SECRET || !header?.startsWith('sha256=') || !Buffer.isBuffer(rawBody)) return res.status(401).json({ error: 'Invalid webhook signature' });
  const expected = createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest();
  let actual;
  try { actual = Buffer.from(header.slice(7), 'hex'); } catch { actual = Buffer.alloc(0); }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'Invalid webhook signature' });
  next();
}
