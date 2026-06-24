import { labelCreateSchema, labelService, labelUpdateSchema } from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

export const labelsRouter: Router = Router();
labelsRouter.use(requireAuth);

labelsRouter.post('/', async (req, res) => {
  const label = await labelService.createLabel(userId(req), labelCreateSchema.parse(req.body));
  res.status(201).json(label);
});

labelsRouter.get('/', async (req, res) => {
  res.json(await labelService.listLabels(userId(req)));
});

labelsRouter.get('/:id', async (req, res) => {
  res.json(await labelService.getLabel(userId(req), req.params.id!));
});

labelsRouter.patch('/:id', async (req, res) => {
  const label = await labelService.updateLabel(
    userId(req),
    req.params.id!,
    labelUpdateSchema.parse(req.body),
  );
  res.json(label);
});

labelsRouter.delete('/:id', async (req, res) => {
  await labelService.deleteLabel(userId(req), req.params.id!);
  res.status(204).end();
});
