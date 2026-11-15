import { logger } from '../utils/logger.js';

export function notFound(req, res) { res.status(404).json({ error: 'Not found' }); }
export function errorHandler(err, req, res, next) {
  logger.error({ err, path: req.path }, 'Request failed');
  if (res.headersSent) return next(err);
  res.status(err.status ?? 500).json({ error: err.status && err.status < 500 ? err.message : 'Internal server error' });
}
