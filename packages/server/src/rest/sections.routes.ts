import { BadRequest, sectionCreateSchema, sectionService, sectionUpdateSchema } from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

export const sectionsRouter: Router = Router();
sectionsRouter.use(requireAuth);

sectionsRouter.post('/', async (req, res) => {
  const section = await sectionService.createSection(userId(req), sectionCreateSchema.parse(req.body));
  res.status(201).json(section);
});

sectionsRouter.get('/', async (req, res) => {
  const projectId = req.query.projectId;
  if (typeof projectId !== 'string') throw BadRequest('projectId query parameter is required');
  res.json(await sectionService.listSections(userId(req), projectId));
});

sectionsRouter.patch('/:id', async (req, res) => {
  const section = await sectionService.updateSection(
    userId(req),
    req.params.id!,
    sectionUpdateSchema.parse(req.body),
  );
  res.json(section);
});

sectionsRouter.delete('/:id', async (req, res) => {
  await sectionService.deleteSection(userId(req), req.params.id!);
  res.status(204).end();
});
