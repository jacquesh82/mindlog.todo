import {
  aiLogService,
  aiModelsQuerySchema,
  aiService,
  aiSettingsUpdateSchema,
} from '@mindlog/core';
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

// AI configuration: model + (self-hosted) the user's own provider key, or the
// metered credit balance in cloud-hosted mode.
aiRouter.get('/settings', async (req, res) => {
  res.json(await aiService.getSettings(userId(req)));
});

aiRouter.patch('/settings', async (req, res) => {
  // Throws 403 in cloud-hosted mode (user has no control over AI settings).
  res.json(await aiService.updateSettings(userId(req), aiSettingsUpdateSchema.parse(req.body)));
});

aiRouter.delete('/settings/key', async (req, res) => {
  res.json(await aiService.deleteKey(userId(req)));
});

// Live model list from the provider (uses the supplied or stored key).
aiRouter.post('/models', async (req, res) => {
  const { provider, apiKey } = aiModelsQuerySchema.parse(req.body);
  res.json({ models: await aiService.listModels(userId(req), provider, apiKey) });
});
