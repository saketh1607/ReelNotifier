import { Router } from 'express';
import { listMessages, listUsers } from '../controllers/message.controller.js';
export const messageRouter = Router();
messageRouter.get('/users', listUsers);
messageRouter.get('/messages', listMessages);
