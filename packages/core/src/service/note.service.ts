import {
  notePageText,
  USER_NOTES_QUOTA,
  type Notebook,
  type NotebookCreateInput,
  type NotebookUpdateInput,
  type NotePage,
  type NotePageHit,
  type NotePageSummary,
  type PageCreateInput,
  type PageUpdateInput,
} from '../domain/note.js';
import { cloudHosted, config } from '../config.js';
import { containsAnyTerm, isRelevantHit, mergeByScore, significantTerms } from '../domain/search-relevance.js';
import { embedOne } from '../embeddings/provider.js';
import { BadRequest, NotFound, QuotaExceeded } from '../errors.js';
import * as repo from '../repository/note.repo.js';

/**
 * Reject when writing `content` would push the user's total notes content past
 * the 100 MB quota. `excludePageId` omits the page being overwritten so an edit
 * is measured as a replacement, not an addition.
 */
async function assertWithinNotesQuota(
  userId: string,
  content: string,
  excludePageId?: string,
): Promise<void> {
  // The 100 MB cap protects a self-hosted instance's database; in cloud-hosted
  // mode storage is managed separately, so no hard per-user cap is enforced.
  if (cloudHosted()) return;
  const others = await repo.userContentBytes(userId, excludePageId);
  if (others + Buffer.byteLength(content, 'utf8') > USER_NOTES_QUOTA) {
    throw QuotaExceeded('Notes storage limit reached (100 MB per account)');
  }
}

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
  const content = input.content ?? '';
  if (content) await assertWithinNotesQuota(userId, content);
  const position = await repo.countPages(userId, notebookId);
  return repo.insertPage(userId, notebookId, input.title ?? 'Untitled', content, position);
}

export async function getPage(userId: string, id: string): Promise<NotePage> {
  const page = await repo.getPage(userId, id);
  if (!page) throw NotFound('Page not found');
  return page;
}

export async function updatePage(userId: string, id: string, patch: PageUpdateInput): Promise<NotePage> {
  if (patch.content !== undefined) await assertWithinNotesQuota(userId, patch.content, id);
  const updated = await repo.updatePage(userId, id, patch);
  if (!updated) throw NotFound('Page not found');
  // Re-embed when content/title changed or the RAG flag was touched.
  if (patch.inRag !== undefined || patch.content !== undefined || patch.title !== undefined) {
    await syncEmbedding(updated);
  }
  return updated;
}

/** Toggle the RAG flag for every page of a notebook at once; returns the count. */
export async function setNotebookRag(userId: string, notebookId: string, inRag: boolean): Promise<number> {
  const notebook = await repo.getNotebook(userId, notebookId);
  if (!notebook) throw NotFound('Notebook not found');
  const pages = await repo.listPages(userId, notebookId);
  for (const p of pages) {
    const updated = await repo.updatePage(userId, p.id, { inRag });
    if (updated) await syncEmbedding(updated);
  }
  return pages.length;
}

/**
 * Search the user's note pages, optionally scoped to specific notebooks/pages.
 *
 * Two branches are merged so a query never silently misses a literal match:
 *   - lexical: pages whose title/content literally contain a query term — works
 *     on EVERY page, even ones not embedded into the RAG (score 1, ranked top);
 *   - semantic: k-NN over RAG-enabled pages, kept when above the floor and a
 *     strong match or sharing a term (catches paraphrases the lexical pass misses).
 */
export async function searchPages(
  userId: string,
  query: string,
  k = 5,
  scope?: { notebookIds?: string[]; pageIds?: string[] },
): Promise<NotePageHit[]> {
  const terms = significantTerms(query);
  // Embed for the semantic branch, but never let a provider failure (or empty
  // vector) block the lexical branch from finding literal matches.
  const vec = await embedOne(query).catch(() => [] as number[]);

  const [lexicalPages, semanticHits] = await Promise.all([
    repo.searchLexical(userId, terms, k, scope),
    vec.length ? repo.search(userId, vec, k, scope) : Promise.resolve([] as NotePageHit[]),
  ]);

  // Re-verify lexical hits against the page's de-HTML'd text so an ILIKE that
  // matched a markup token (e.g. "<span>") isn't reported as a content match.
  const lexical: NotePageHit[] = lexicalPages
    .filter((p) => containsAnyTerm(notePageText(p.title, p.content), terms))
    .map(({ content: _c, ...rest }) => ({ ...rest, score: 1 }));

  const semantic = semanticHits.filter((h) =>
    isRelevantHit(h.score, h.title, terms, {
      minScore: config.searchMinScore,
      strongScore: config.searchStrongScore,
    }),
  );

  return mergeByScore(lexical, semantic, k);
}

export async function deletePage(userId: string, id: string): Promise<void> {
  if (!(await repo.removePage(userId, id))) throw NotFound('Page not found');
}

/** Duplicate a page (title + " (copy)", same content/RAG flag) within its notebook. */
export async function duplicatePage(userId: string, id: string): Promise<NotePage> {
  const src = await repo.getPage(userId, id);
  if (!src) throw NotFound('Page not found');
  const position = await repo.countPages(userId, src.notebookId);
  const copy = await repo.insertPage(userId, src.notebookId, `${src.title} (copy)`, src.content, position);
  if (src.inRag) {
    const updated = await repo.updatePage(userId, copy.id, { inRag: true });
    if (updated) {
      await syncEmbedding(updated);
      return updated;
    }
  }
  return copy;
}
