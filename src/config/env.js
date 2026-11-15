import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  META_APP_ID: z.string().optional().default(''),
  META_APP_SECRET: z.string().optional().default(''),
  META_VERIFY_TOKEN: z.string().min(1, 'META_VERIFY_TOKEN is required'),
  META_ACCESS_TOKEN: z.string().optional().default(''),
  META_PAGE_ID: z.string().default('1471732602688156'),
  INSTAGRAM_ACCOUNT_ID: z.string().default('17841423026295491'),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v27.0'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_ADMIN_KEY: z.string().min(16, 'API_ADMIN_KEY must be at least 16 characters'),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}
export const env = Object.freeze(parsed.data);
