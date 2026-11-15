import express from 'express';

const parseRawJson = express.raw({ type: 'application/json', limit: '1mb', inflate: false });

export function rawWebhookBody(req, res, next) {
  if (req.method !== 'POST') return next();
  return parseRawJson(req, res, (error) => {
    if (error) return next(error);
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Expected an application/json webhook body' });
    req.rawBody = Buffer.from(req.body);
    try { req.body = JSON.parse(req.rawBody.toString('utf8')); }
    catch { return res.status(400).json({ error: 'Malformed JSON webhook body' }); }
    return next();
  });
}
