// Catalog of selectable chat LLMs (the "ask" RAG). Source of truth shared by
// the settings UI (model picker) and the chat façade (provider routing). Not
// restricted to Anthropic — add entries here to offer more providers/models.

export type ChatProviderId = 'anthropic' | 'openai';

export interface ChatModel {
  id: string;
  provider: ChatProviderId;
  label: string;
}

export const CHAT_MODELS: ChatModel[] = [
  { id: 'claude-opus-4-8', provider: 'anthropic', label: 'Claude Opus 4.8' },
  { id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', provider: 'anthropic', label: 'Claude Haiku 4.5' },
  { id: 'gpt-4o', provider: 'openai', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o mini' },
];

export const DEFAULT_CHAT_MODEL = 'claude-sonnet-4-6';

export function isKnownChatModel(id: string): boolean {
  return CHAT_MODELS.some((m) => m.id === id);
}

/** Provider that serves a model id; defaults to Anthropic for unknown ids. */
export function providerOf(modelId: string): ChatProviderId {
  return CHAT_MODELS.find((m) => m.id === modelId)?.provider ?? 'anthropic';
}
