import { ServiceUnavailable } from '../errors.js';
import type { ChatProviderId } from './models.js';

// Fetch the available model ids directly from each provider's REST API, using
// the user's own key. Returns a sorted list of model ids for the picker.

export async function listProviderModels(
  provider: ChatProviderId,
  apiKey: string,
): Promise<string[]> {
  if (!apiKey) throw ServiceUnavailable('An API key is required to list models');
  const ids =
    provider === 'anthropic'
      ? await anthropicModels(apiKey)
      : await openAiCompatibleModels(provider, apiKey);
  return [...new Set(ids)].sort();
}

async function anthropicModels(apiKey: string): Promise<string[]> {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
  });
  if (!res.ok) throw ServiceUnavailable(`Anthropic models failed: ${res.status}`);
  const json = (await res.json()) as { data?: { id: string }[] };
  return (json.data ?? []).map((m) => m.id);
}

const OPENAI_COMPATIBLE_BASE: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  mistral: 'https://api.mistral.ai/v1',
};

async function openAiCompatibleModels(provider: ChatProviderId, apiKey: string): Promise<string[]> {
  const base = OPENAI_COMPATIBLE_BASE[provider] ?? OPENAI_COMPATIBLE_BASE.openai!;
  const res = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw ServiceUnavailable(`${provider} models failed: ${res.status}`);
  const json = (await res.json()) as { data?: { id: string }[] };
  return (json.data ?? []).map((m) => m.id);
}
