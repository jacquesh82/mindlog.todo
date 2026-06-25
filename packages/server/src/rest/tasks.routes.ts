import {
  askTasks,
  taskAskSchema,
  taskCreateSchema,
  taskListQuerySchema,
  taskQuickAddSchema,
  taskSearchSchema,
  taskService,
  taskUpdateSchema,
} from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';
import { registerTaskAttachmentRoutes } from './attachments.routes.js';

export const tasksRouter: Router = Router();
tasksRouter.use(requireAuth);
registerTaskAttachmentRoutes(tasksRouter);

tasksRouter.post('/', async (req, res) => {
  const task = await taskService.createTask(userId(req), taskCreateSchema.parse(req.body));
  res.status(201).json(task);
});

tasksRouter.get('/', async (req, res) => {
  res.json(await taskService.listTasks(userId(req), taskListQuerySchema.parse(req.query)));
});

// Static sub-paths must be declared before the dynamic ":id" routes.
tasksRouter.post('/quickadd', async (req, res) => {
  const { text, tz } = taskQuickAddSchema.parse(req.body);
  res.status(201).json(await taskService.quickAddTask(userId(req), text, tz));
});

tasksRouter.post('/parse', async (req, res) => {
  const { text, tz } = taskQuickAddSchema.parse(req.body);
  res.json(await taskService.previewQuickAdd(userId(req), text, tz));
});

// Ad-hoc filter query: GET /tasks/query?q=(p1 | p2) & @work & 7 days
tasksRouter.get('/query', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json(await taskService.runFilterQuery(userId(req), q));
});

tasksRouter.post('/search', async (req, res) => {
  res.json(await taskService.searchTasks(userId(req), taskSearchSchema.parse(req.body)));
});

tasksRouter.post('/ask', async (req, res) => {
  res.json(await askTasks(userId(req), taskAskSchema.parse(req.body)));
});

tasksRouter.get('/:id', async (req, res) => {
  const withChildren = req.query.withChildren !== undefined && req.query.withChildren !== 'false';
  res.json(await taskService.getTask(userId(req), req.params.id!, { withChildren }));
});

tasksRouter.get('/:id/subtasks', async (req, res) => {
  const q = taskListQuerySchema.parse({ ...req.query, parentId: req.params.id });
  res.json(await taskService.listTasks(userId(req), q));
});

tasksRouter.post('/:id/subtasks', async (req, res) => {
  const body = taskCreateSchema.parse({ ...req.body, parentId: req.params.id });
  res.status(201).json(await taskService.createTask(userId(req), body));
});

tasksRouter.patch('/:id', async (req, res) => {
  const task = await taskService.updateTask(userId(req), req.params.id!, taskUpdateSchema.parse(req.body));
  res.json(task);
});

tasksRouter.delete('/:id', async (req, res) => {
  await taskService.deleteTask(userId(req), req.params.id!);
  res.status(204).end();
});
