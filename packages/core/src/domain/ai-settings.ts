import { z } from 'zod';
import type { AiCredits } from './ai-log.js';
import type { ChatModel, ChatProvider, ChatProviderId } from '../llm/models.js';

// Self-hosted users PATCH their provider, model (a known id or a free-text
// custom one), and/or their own API key (write-only).
export const aiSettingsUpdateSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'mistral']).optional(),
  model: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).max(400).optional(),
});
export type AiSettingsUpdateInput = z.infer<typeof aiSettingsUpdateSchema>;

// Request to list a provider's models live (optionally with an inline key,
// otherwise the stored one is used).
export const aiModelsQuerySchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'mistral']),
  apiKey: z.string().min(1).max(400).optional(),
});
export type AiModelsQueryInput = z.infer<typeof aiModelsQuerySchema>;

/** What GET /ai/settings returns to the SPA. */
export interface AiSettingsView {
  /** Cloud-hosted: shared key + metered credits; user cannot edit AI settings. */
  cloudHosted: boolean;
  provider: ChatProviderId;
  model: string;
  /** Whether a usable key is configured (the key itself is never returned). */
  hasKey: boolean;
  /** Provider options for the picker. */
  providers: ChatProvider[];
  /** Static fallback model suggestions (live models are fetched separately). */
  models: ChatModel[];
  /** Credit balance (cloud-hosted only; null otherwise). */
  credits: AiCredits | null;
}
