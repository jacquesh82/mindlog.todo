import {
  projectCreateSchema,
  projectListQuerySchema,
  projectService,
  projectUpdateSchema,
} from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

export const projectsRouter: Router = Router();
projectsRouter.use(requireAuth);

projectsRouter.post('/', async (req, res) => {
  const project = await projectService.createProject(userId(req), projectCreateSchema.parse(req.body));
  res.status(201).json(project);
});

projectsRouter.get('/', async (req, res) => {
  const { includeArchived } = projectListQuerySchema.parse(req.query);
  res.json(await projectService.listProjects(userId(req), includeArchived));
});

projectsRouter.get('/:id', async (req, res) => {
  res.json(await projectService.getProject(userId(req), req.params.id!));
});

projectsRouter.patch('/:id', async (req, res) => {
  const project = await projectService.updateProject(
    userId(req),
    req.params.id!,
    projectUpdateSchema.parse(req.body),
  );
  res.json(project);
});

projectsRouter.delete('/:id', async (req, res) => {
  await projectService.deleteProject(userId(req), req.params.id!);
  res.status(204).end();
});
