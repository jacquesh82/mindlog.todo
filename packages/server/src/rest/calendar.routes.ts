import {
  authService,
  calendarService,
  calendarSourceCreateSchema,
  calendarSourceUpdateSchema,
} from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

export const calendarRouter: Router = Router();
calendarRouter.use(requireAuth);

// mindlog id agenda connection: report whether it's connected + the agenda right
// was granted, and allow the user to disconnect it.
calendarRouter.get('/mindlog-id', async (req, res) => {
  res.json(await authService.mindlogIdConnectionStatus(userId(req)));
});

calendarRouter.delete('/mindlog-id', async (req, res) => {
  await authService.disconnectMindlogId(userId(req));
  res.status(204).end();
});

calendarRouter.get('/sources', async (req, res) => {
  res.json(await calendarService.listSources(userId(req)));
});

calendarRouter.post('/sources', async (req, res) => {
  const input = calendarSourceCreateSchema.parse(req.body);
  res.status(201).json(await calendarService.createSource(userId(req), input));
});

calendarRouter.patch('/sources/:id', async (req, res) => {
  const patch = calendarSourceUpdateSchema.parse(req.body);
  res.json(await calendarService.updateSource(userId(req), req.params.id!, patch));
});

calendarRouter.delete('/sources/:id', async (req, res) => {
  await calendarService.deleteSource(userId(req), req.params.id!);
  res.status(204).end();
});

// Merged events from all the user's feeds, optionally within ?from&to (ISO).
calendarRouter.get('/events', async (req, res) => {
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;
  res.json(await calendarService.getEvents(userId(req), from, to));
});
