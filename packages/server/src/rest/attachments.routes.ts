import { attachmentCreateSchema, attachmentService } from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

// Per-task attachment routes are registered on the tasks router; this router
// handles the by-id GET (with content) and DELETE.
export const attachmentsRouter: Router = Router();
attachmentsRouter.use(requireAuth);

attachmentsRouter.get('/:id', async (req, res) => {
  res.json(await attachmentService.getAttachment(userId(req), req.params.id!));
});

attachmentsRouter.delete('/:id', async (req, res) => {
  await attachmentService.deleteAttachment(userId(req), req.params.id!);
  res.status(204).end();
});

/** Register `/:id/attachments` (list + create) on the tasks router. */
export function registerTaskAttachmentRoutes(tasksRouter: Router): void {
  tasksRouter.get('/:id/attachments', async (req, res) => {
    res.json(await attachmentService.listAttachments(userId(req), req.params.id!));
  });
  tasksRouter.post('/:id/attachments', async (req, res) => {
    const input = attachmentCreateSchema.parse(req.body);
    res.status(201).json(await attachmentService.addAttachment(userId(req), req.params.id!, input));
  });
}
