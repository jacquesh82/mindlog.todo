import { z } from 'zod';
import type { AiCredits } from './ai-log.js';
import type { ChatModel } from '../llm/models.js';

// Self-hosted users PATCH their chosen model and/or their own provider API key.
// The provider is derived from the model server-side; the key is write-only.
export const aiSettingsUpdateSchema = z.object({
  model: z.string().max(100).optional(),
  apiKey: z.string().min(1).max(400).optional(),
});
export type AiSettingsUpdateInput = z.infer<typeof aiSettingsUpdateSchema>;

/** What GET /ai/settings returns to the SPA. */
export interface AiSettingsView {
  /** Cloud-hosted: shared key + metered credits; user cannot edit AI settings. */
  cloudHosted: boolean;
  model: string;
  /** Whether a usable key is configured (the key itself is never returned). */
  hasKey: boolean;
  /** Catalog for the model picker (self-hosted only). */
  models: ChatModel[];
  /** Credit balance (cloud-hosted only; null otherwise). */
  credits: AiCredits | null;
}
