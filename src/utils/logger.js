import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({ level: env.LOG_LEVEL, redact: { paths: ['req.headers.authorization', 'req.headers.x-api-key', 'config.headers.Authorization', 'access_token', '*.access_token', 'META_PAGE_ACCESS_TOKEN', 'META_APP_SECRET'], censor: '[REDACTED]' } });
