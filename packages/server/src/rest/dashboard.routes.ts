import { dashboardService } from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

export const dashboardRouter: Router = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get('/', async (req, res) => {
  res.json(await dashboardService.getDashboard(userId(req)));
});
