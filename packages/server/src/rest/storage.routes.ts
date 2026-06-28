import { storageService } from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

export const storageRouter: Router = Router();
storageRouter.use(requireAuth);

// Per-user database storage footprint (notes + attachments).
storageRouter.get('/', async (req, res) => {
  res.json(await storageService.getStorageUsage(userId(req)));
});
