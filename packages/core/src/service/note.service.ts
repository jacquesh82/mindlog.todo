import {
  notePageText,
  type Notebook,
  type NotebookCreateInput,
  type NotebookUpdateInput,
  type NotePage,
  type NotePageHit,
  type NotePageSummary,
  type PageCreateInput,
  type PageUpdateInput,
} from '../domain/note.js';
import { embedOne } from '../embeddings/provider.js';
import { BadRequest, NotFound } from '../errors.js';
import * as repo from '../repository/note.repo.js';

/** Re-embed a page for RAG, or clear its embedding when not opted in. */
async function syncEmbedding(page: NotePage): Promise<void> {
  if (!page.inRag) {
    await repo.setEmbedding(page.id, null);
    return;
  }
  try {
    const vec = await embedOne(notePageText(page.title, page.content));
    await repo.setEmbedding(page.id, vec.length ? vec : null);
  } catch (err) {
    console.error('[note-rag] embed skipped:', err);
  }
}

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
  // Re-embed when content/title changed or the RAG flag was touched.
  if (patch.inRag !== undefined || patch.content !== undefined || patch.title !== undefined) {
    await syncEmbedding(updated);
  }
  return updated;
}

/** Semantic search over the user's RAG-enabled note pages. */
export async function searchPages(userId: string, query: string, k = 5): Promise<NotePageHit[]> {
  const vec = await embedOne(query);
  if (vec.length === 0) return [];
  return repo.search(userId, vec, k);
}

export async function deletePage(userId: string, id: string): Promise<void> {
  if (!(await repo.removePage(userId, id))) throw NotFound('Page not found');
}
