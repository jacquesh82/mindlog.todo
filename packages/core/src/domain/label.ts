import { z } from 'zod';

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a #rrggbb hex string');

export const labelCreateSchema = z.object({
  name: z.string().min(1).max(100),
  color: colorSchema.optional(),
});
export type LabelCreateInput = z.infer<typeof labelCreateSchema>;

export const labelUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: colorSchema.nullable().optional(),
});
export type LabelUpdateInput = z.infer<typeof labelUpdateSchema>;

export interface Label {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}
