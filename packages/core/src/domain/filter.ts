import { z } from 'zod';

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a #rrggbb hex string');

export const filterCreateSchema = z.object({
  name: z.string().min(1).max(200),
  query: z.string().min(1).max(1000),
  color: colorSchema.optional(),
  position: z.number().int().min(0).optional(),
});
export type FilterCreateInput = z.infer<typeof filterCreateSchema>;

export const filterUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  query: z.string().min(1).max(1000).optional(),
  color: colorSchema.nullable().optional(),
  position: z.number().int().min(0).optional(),
});
export type FilterUpdateInput = z.infer<typeof filterUpdateSchema>;

export interface Filter {
  id: string;
  userId: string;
  name: string;
  query: string;
  color: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}
