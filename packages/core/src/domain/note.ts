import { z } from 'zod';

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be #rrggbb');

export const notebookCreateSchema = z.object({
  name: z.string().min(1).max(200),
  color: colorSchema.optional(),
});
export type NotebookCreateInput = z.infer<typeof notebookCreateSchema>;

export const notebookUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: colorSchema.nullable().optional(),
});
export type NotebookUpdateInput = z.infer<typeof notebookUpdateSchema>;

// Content can embed pasted images as base64 data URLs, so allow a generous size.
const PAGE_CONTENT_MAX = 12_000_000;

/** Total notes content allowed per user across all pages (100 MB, UTF-8 bytes). */
export const USER_NOTES_QUOTA = 100 * 1024 * 1024;

export const pageCreateSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(PAGE_CONTENT_MAX).optional(),
  inRag: z.boolean().optional(),
});
export type PageCreateInput = z.infer<typeof pageCreateSchema>;

export const pageUpdateSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(PAGE_CONTENT_MAX).optional(),
  position: z.number().int().min(0).optional(),
  inRag: z.boolean().optional(),
  color: colorSchema.nullable().optional(),
});
export type PageUpdateInput = z.infer<typeof pageUpdateSchema>;

export interface Notebook {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotePage {
  id: string;
  notebookId: string;
  userId: string;
  title: string;
  content: string;
  position: number;
  inRag: boolean;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A page without its (potentially large) content, for list views. */
export type NotePageSummary = Omit<NotePage, 'content'>;

export interface NotePageHit extends NotePageSummary {
  score: number;
}

/** Plain-text of a page (title + de-HTML'd box content) for embedding. */
export function notePageText(title: string, content: string): string {
  const strip = (html: string) =>
    html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
  let body = '';
  try {
    const parsed = JSON.parse(content) as { boxes?: { html: string }[] };
    if (parsed && Array.isArray(parsed.boxes)) body = parsed.boxes.map((b) => strip(b.html)).join('\n');
    else body = strip(content);
  } catch {
    body = strip(content);
  }
  return [title, body].filter(Boolean).join('\n').trim();
}
