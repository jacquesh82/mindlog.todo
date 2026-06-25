import { apiKeyCreateSchema, authService, exportService, NotFound } from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

export const accountRouter: Router = Router();
accountRouter.use(requireAuth);

accountRouter.get('/me', async (req, res) => {
  const user = await authService.getUser(userId(req));
  if (!user) throw NotFound('User not found');
  res.json(user);
});

// Full JSON export of every piece of the user's data (backup / portability).
accountRouter.get('/export', async (req, res) => {
  const data = await exportService.buildExport(userId(req));
  res.setHeader('Content-Disposition', 'attachment; filename="mindlog-export.json"');
  res.json(data);
});

accountRouter.get('/api-keys', async (req, res) => {
  res.json(await authService.listApiKeys(userId(req)));
});

accountRouter.post('/api-keys', async (req, res) => {
  const { name } = apiKeyCreateSchema.parse(req.body);
  const { apiKey, secret } = await authService.createApiKey(userId(req), name);
  // `secret` is returned only once, at creation time.
  res.status(201).json({ ...apiKey, secret });
});

accountRouter.delete('/api-keys/:id', async (req, res) => {
  if (!(await authService.revokeApiKey(userId(req), req.params.id!))) {
    throw NotFound('API key not found');
  }
  res.status(204).end();
});
