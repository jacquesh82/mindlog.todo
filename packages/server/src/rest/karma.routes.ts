import { karmaService } from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

export const karmaRouter: Router = Router();
karmaRouter.use(requireAuth);

karmaRouter.get('/', async (req, res) => {
  res.json(await karmaService.getKarma(userId(req)));
});
