import {
  filterCreateSchema,
  filterService,
  filterUpdateSchema,
  taskService,
} from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

export const filtersRouter: Router = Router();
filtersRouter.use(requireAuth);

filtersRouter.post('/', async (req, res) => {
  const filter = await filterService.createFilter(userId(req), filterCreateSchema.parse(req.body));
  res.status(201).json(filter);
});

filtersRouter.get('/', async (req, res) => {
  res.json(await filterService.listFilters(userId(req)));
});

filtersRouter.get('/:id', async (req, res) => {
  res.json(await filterService.getFilter(userId(req), req.params.id!));
});

// Run a saved filter and return the matching tasks.
filtersRouter.get('/:id/tasks', async (req, res) => {
  const filter = await filterService.getFilter(userId(req), req.params.id!);
  res.json(await taskService.runFilterQuery(userId(req), filter.query));
});

filtersRouter.patch('/:id', async (req, res) => {
  const filter = await filterService.updateFilter(
    userId(req),
    req.params.id!,
    filterUpdateSchema.parse(req.body),
  );
  res.json(filter);
});

filtersRouter.delete('/:id', async (req, res) => {
  await filterService.deleteFilter(userId(req), req.params.id!);
  res.status(204).end();
});
