import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

export function requireAdmin(req, res, next) {
  const provided = req.get('x-api-key') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(env.API_ADMIN_KEY);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
