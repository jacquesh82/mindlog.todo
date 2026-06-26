import { z } from 'zod';

export const sectionCreateSchema = z.object({
  projectId: z.uuid(),
  name: z.string().min(1).max(200),
  position: z.number().int().min(0).optional(),
});
export type SectionCreateInput = z.infer<typeof sectionCreateSchema>;

export const sectionUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  position: z.number().int().min(0).optional(),
});
export type SectionUpdateInput = z.infer<typeof sectionUpdateSchema>;

export interface Section {
  id: string;
  projectId: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}
