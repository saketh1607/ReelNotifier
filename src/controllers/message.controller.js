import { prisma } from '../config/database.js';

export async function listUsers(req, res) { const data = await prisma.user.findMany({ take: 100, orderBy: { createdAt: 'desc' } }); res.json({ data }); }
export async function listMessages(req, res) { const data = await prisma.incomingMessage.findMany({ take: 100, orderBy: { receivedAt: 'desc' } }); res.json({ data }); }
