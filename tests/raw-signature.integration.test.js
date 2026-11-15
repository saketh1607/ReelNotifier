import { createHmac } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import express from 'express';

const { rawWebhookBody } = await import('../src/middleware/raw-webhook-body.middleware.js');
const rawCaptureApp = express();
rawCaptureApp.use('/webhooks/instagram', rawWebhookBody);
rawCaptureApp.use(express.json({ verify(req, res, buffer) { req.rawBody ??= Buffer.from(buffer); } }));
rawCaptureApp.post('/webhooks/instagram', (req, res) => res.json({ raw: req.rawBody.toString('utf8'), parsed: req.body }));

describe('raw webhook signature validation', () => {
  it('validates the exact whitespace-preserving request bytes before JSON parsing', async () => {
    const raw = Buffer.from('{  "object" : "instagram", "entry" : []  }');
    const response = await request(rawCaptureApp).post('/webhooks/instagram').set('Content-Type', 'application/json').send(raw.toString('utf8'));
    expect(response.status).toBe(200);
    expect(response.body.raw).toBe(raw.toString('utf8'));
    expect(response.body.parsed).toEqual({ object: 'instagram', entry: [] });
  });

  it('rejects a signature calculated over normalized JSON instead of the received bytes', async () => {
    const raw = Buffer.from('{  "object" : "instagram", "entry" : []  }');
    const receivedBytes = await request(rawCaptureApp).post('/webhooks/instagram').set('Content-Type', 'application/json').send(raw.toString('utf8'));
    const normalizedSignature = createHmac('sha256', 'raw-signature-secret').update(JSON.stringify(receivedBytes.body.parsed)).digest('hex');
    const actualSignature = createHmac('sha256', 'raw-signature-secret').update(receivedBytes.body.raw).digest('hex');
    expect(normalizedSignature).not.toBe(actualSignature);
  });
});
