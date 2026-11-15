import { z } from 'zod';
import { prisma } from '../config/database.js';
import { createTracking } from '../services/tracking.service.js';

const createSchema = z.object({ userId: z.string().optional(), instagramUserId: z.string().min(1).optional(), originalReelUrl: z.string().url().optional(), mediaId: z.string().min(1).optional() })
  .refine((v) => v.userId || v.instagramUserId, { message: 'userId or instagramUserId is required' })
  .refine((v) => v.originalReelUrl || v.mediaId, { message: 'originalReelUrl or mediaId is required' });
export async function listTrackings(req, res) { const data = await prisma.reelTracking.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { user: true, reel: true } }); res.json({ data }); }
export async function getTracking(req, res) { const data = await prisma.reelTracking.findUnique({ where: { id: req.params.id }, include: { user: true, reel: true, detectedReels: true } }); if (!data) return res.status(404).json({ error: 'Tracking not found' }); res.json({ data }); }
export async function postTracking(req, res) { const input = createSchema.safeParse(req.body); if (!input.success) return res.status(400).json({ error: 'Invalid request', details: input.error.flatten() }); const data = await createTracking({ ...input.data, reelReference: input.data.originalReelUrl ? { url: input.data.originalReelUrl, mediaId: input.data.mediaId } : { mediaId: input.data.mediaId } }); res.status(201).json({ data }); }
export async function deleteTracking(req, res) { await prisma.reelTracking.delete({ where: { id: req.params.id } }); res.sendStatus(204); }
