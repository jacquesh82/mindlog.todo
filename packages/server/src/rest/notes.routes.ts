import {
  notebookCreateSchema,
  notebookUpdateSchema,
  noteService,
  pageCreateSchema,
  pageUpdateSchema,
} from '@mindlog/core';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, userId } from '../middleware/auth.js';

export const notesRouter: Router = Router();
notesRouter.use(requireAuth);

// Notebooks
notesRouter.get('/notebooks', async (req, res) => {
  res.json(await noteService.listNotebooks(userId(req)));
});
notesRouter.post('/notebooks', async (req, res) => {
  res.status(201).json(await noteService.createNotebook(userId(req), notebookCreateSchema.parse(req.body)));
});
notesRouter.patch('/notebooks/:id', async (req, res) => {
  res.json(await noteService.updateNotebook(userId(req), req.params.id!, notebookUpdateSchema.parse(req.body)));
});
notesRouter.delete('/notebooks/:id', async (req, res) => {
  await noteService.deleteNotebook(userId(req), req.params.id!);
  res.status(204).end();
});

// Add/remove every page of a notebook to/from the RAG in one go.
notesRouter.post('/notebooks/:id/rag', async (req, res) => {
  const { inRag } = z.object({ inRag: z.boolean() }).parse(req.body);
  const count = await noteService.setNotebookRag(userId(req), req.params.id!, inRag);
  res.json({ updated: count });
});

// Pages
notesRouter.get('/notebooks/:id/pages', async (req, res) => {
  res.json(await noteService.listPages(userId(req), req.params.id!));
});
notesRouter.post('/notebooks/:id/pages', async (req, res) => {
  res.status(201).json(await noteService.createPage(userId(req), req.params.id!, pageCreateSchema.parse(req.body)));
});
notesRouter.get('/pages/:id', async (req, res) => {
  res.json(await noteService.getPage(userId(req), req.params.id!));
});
notesRouter.post('/pages/:id/duplicate', async (req, res) => {
  res.status(201).json(await noteService.duplicatePage(userId(req), req.params.id!));
});
notesRouter.patch('/pages/:id', async (req, res) => {
  res.json(await noteService.updatePage(userId(req), req.params.id!, pageUpdateSchema.parse(req.body)));
});
notesRouter.delete('/pages/:id', async (req, res) => {
  await noteService.deletePage(userId(req), req.params.id!);
  res.status(204).end();
});
