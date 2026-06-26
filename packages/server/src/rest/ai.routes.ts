import { aiLogService } from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

export const aiRouter: Router = Router();
aiRouter.use(requireAuth);

aiRouter.get('/usage', async (req, res) => {
  res.json(await aiLogService.getUsage(userId(req)));
});

aiRouter.get('/logs', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  res.json(await aiLogService.listLogs(userId(req), limit));
});
