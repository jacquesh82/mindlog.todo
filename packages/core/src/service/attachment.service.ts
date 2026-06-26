import type { Attachment, AttachmentCreateInput } from '../domain/attachment.js';
import { NotFound } from '../errors.js';
import * as repo from '../repository/attachment.repo.js';
import * as taskRepo from '../repository/task.repo.js';
import { reembedTask } from './task.service.js';

export async function addAttachment(
  userId: string,
  taskId: string,
  input: AttachmentCreateInput,
): Promise<Attachment> {
  const task = await taskRepo.getById(userId, taskId);
  if (!task) throw NotFound('Task not found');
  const attachment = await repo.insert(userId, taskId, input.filename, input.mime ?? null, input.content);
  // Fold the new content into the task's embedding so it is searchable.
  await reembedTask(userId, taskId);
  return attachment;
}

export function listAttachments(userId: string, taskId: string): Promise<Attachment[]> {
  return repo.listByTask(userId, taskId);
}

export async function getAttachment(userId: string, id: string): Promise<Attachment> {
  const attachment = await repo.getById(userId, id);
  if (!attachment) throw NotFound('Attachment not found');
  return attachment;
}

export async function deleteAttachment(userId: string, id: string): Promise<void> {
  const taskId = await repo.remove(userId, id);
  if (!taskId) throw NotFound('Attachment not found');
  await reembedTask(userId, taskId);
}
