import { Router } from 'express';
import { receiveWebhook, verifyWebhook } from '../controllers/webhook.controller.js';
import { validateMetaSignature } from '../middleware/signature.middleware.js';
export const webhookRouter = Router();
webhookRouter.get('/instagram', verifyWebhook);
webhookRouter.post('/instagram', validateMetaSignature, receiveWebhook);
