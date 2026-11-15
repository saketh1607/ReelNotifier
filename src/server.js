import { app, closeAppConnections } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { closeQueues } from './queues/index.js';

const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'ReelNotifier API listening'));
let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'Shutting down');
  server.close(async () => { await closeQueues(); await closeAppConnections(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
