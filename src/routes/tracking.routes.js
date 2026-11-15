import { Router } from 'express';
import { deleteTracking, getTracking, listTrackings, postTracking } from '../controllers/tracking.controller.js';
export const trackingRouter = Router();
trackingRouter.get('/', listTrackings);
trackingRouter.post('/', postTracking);
trackingRouter.get('/:id', getTracking);
trackingRouter.delete('/:id', deleteTracking);
