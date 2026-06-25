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

export const pageCreateSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(1_000_000).optional(),
});
export type PageCreateInput = z.infer<typeof pageCreateSchema>;

export const pageUpdateSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(1_000_000).optional(),
  position: z.number().int().min(0).optional(),
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
  createdAt: string;
  updatedAt: string;
}

/** A page without its (potentially large) content, for list views. */
export type NotePageSummary = Omit<NotePage, 'content'>;
