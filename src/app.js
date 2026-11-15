import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import { prisma } from './config/database.js';
import { redis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { requireAdmin } from './middleware/auth.middleware.js';
import { notFound, errorHandler } from './middleware/error.middleware.js';
import { webhookRouter } from './routes/webhook.routes.js';
import { trackingRouter } from './routes/tracking.routes.js';
import { messageRouter } from './routes/message.routes.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(pinoHttp({ logger, serializers: { req(req) { const pathname = String(req.url ?? '').split('?')[0]; return { id: req.id, method: req.method, url: pathname, remoteAddress: req.remoteAddress }; } } }));
app.use(express.json({ limit: '1mb', verify(req, res, buffer) { req.rawBody = Buffer.from(buffer); } }));
app.get('/health', async (req, res) => {
  const checks = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
  const healthy = checks.every((result) => result.status === 'fulfilled');
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks: { database: checks[0].status === 'fulfilled' ? 'ok' : 'error', redis: checks[1].status === 'fulfilled' ? 'ok' : 'error' } });
});
app.use('/webhooks', webhookRouter);
const adminLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api', adminLimiter, requireAdmin);
app.use('/api', messageRouter);
app.use('/api/trackings', trackingRouter);
app.use(notFound);
app.use(errorHandler);

export async function closeAppConnections() { await Promise.allSettled([prisma.$disconnect(), redis.quit()]); }
