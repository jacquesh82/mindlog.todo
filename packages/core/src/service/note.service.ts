import type {
  Notebook,
  NotebookCreateInput,
  NotebookUpdateInput,
  NotePage,
  NotePageSummary,
  PageCreateInput,
  PageUpdateInput,
} from '../domain/note.js';
import { BadRequest, NotFound } from '../errors.js';
import * as repo from '../repository/note.repo.js';

export function createNotebook(userId: string, input: NotebookCreateInput): Promise<Notebook> {
  return repo.insertNotebook(userId, input.name, input.color ?? null);
}

export function listNotebooks(userId: string): Promise<Notebook[]> {
  return repo.listNotebooks(userId);
}

export async function updateNotebook(userId: string, id: string, patch: NotebookUpdateInput): Promise<Notebook> {
  const updated = await repo.updateNotebook(userId, id, patch);
  if (!updated) throw NotFound('Notebook not found');
  return updated;
}

export async function deleteNotebook(userId: string, id: string): Promise<void> {
  if (!(await repo.removeNotebook(userId, id))) throw NotFound('Notebook not found');
}

export function listPages(userId: string, notebookId: string): Promise<NotePageSummary[]> {
  return repo.listPages(userId, notebookId);
}

export async function createPage(userId: string, notebookId: string, input: PageCreateInput): Promise<NotePage> {
  const notebook = await repo.getNotebook(userId, notebookId);
  if (!notebook) throw BadRequest('notebookId does not reference an existing notebook');
  const position = await repo.countPages(userId, notebookId);
  return repo.insertPage(userId, notebookId, input.title ?? 'Untitled', input.content ?? '', position);
}

export async function getPage(userId: string, id: string): Promise<NotePage> {
  const page = await repo.getPage(userId, id);
  if (!page) throw NotFound('Page not found');
  return page;
}

export async function updatePage(userId: string, id: string, patch: PageUpdateInput): Promise<NotePage> {
  const updated = await repo.updatePage(userId, id, patch);
  if (!updated) throw NotFound('Page not found');
  return updated;
}

export async function deletePage(userId: string, id: string): Promise<void> {
  if (!(await repo.removePage(userId, id))) throw NotFound('Page not found');
}
