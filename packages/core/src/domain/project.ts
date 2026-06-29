import { z } from 'zod';

/** How a project's tasks are displayed by default. */
export const PROJECT_VIEW_MODES = ['list', 'board', 'calendar'] as const;
export type ProjectViewMode = (typeof PROJECT_VIEW_MODES)[number];

/** Optional accent colour for a project — a hex string like `#db4c3f`. */
const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a #rrggbb hex string');

export const projectCreateSchema = z.object({
  name: z.string().min(1).max(200),
  color: colorSchema.optional(),
  parentId: z.uuid().nullable().optional(),
  isFavorite: z.boolean().optional(),
  viewMode: z.enum(PROJECT_VIEW_MODES).optional(),
  position: z.number().int().min(0).optional(),
});
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

/** All fields optional; `null` clears `color`/`parentId`. */
export const projectUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: colorSchema.nullable().optional(),
  parentId: z.uuid().nullable().optional(),
  isFavorite: z.boolean().optional(),
  viewMode: z.enum(PROJECT_VIEW_MODES).optional(),
  position: z.number().int().min(0).optional(),
  archived: z.boolean().optional(),
});
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export const projectListQuerySchema = z.object({
  includeArchived: z
    .preprocess((v) => v === true || v === 'true' || v === '1', z.boolean())
    .optional(),
});
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

export interface Project {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  parentId: string | null;
  isInbox: boolean;
  isFavorite: boolean;
  viewMode: ProjectViewMode;
  position: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
