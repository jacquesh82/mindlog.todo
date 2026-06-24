import { z } from 'zod';

export const attachmentCreateSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.string().max(255).optional(),
  /** Extracted text content; folded into the task embedding for RAG. */
  content: z.string().max(500_000).default(''),
});
export type AttachmentCreateInput = z.infer<typeof attachmentCreateSchema>;

export interface Attachment {
  id: string;
  taskId: string;
  userId: string;
  filename: string;
  mime: string | null;
  byteSize: number;
  createdAt: string;
  /** Present only when a single attachment is fetched, not in list payloads. */
  content?: string;
}
