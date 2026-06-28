import { decryptSecret, encryptSecret } from '../auth/crypto.js';
import { cloudHosted, config } from '../config.js';
import type { AiSettingsUpdateInput, AiSettingsView } from '../domain/ai-settings.js';
import { BadRequest, Forbidden, ServiceUnavailable } from '../errors.js';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, isKnownChatModel, providerOf } from '../llm/models.js';
import * as repo from '../repository/ai-settings.repo.js';
import { getCredits } from './ai-log.service.js';

export interface EffectiveAiConfig {
  /** True when using the shared server key (credits metered). */
  cloud: boolean;
  model: string;
  apiKey: string;
}

/**
 * Resolve which model + key to use for a user's AI call:
 * - cloud-hosted: the shared server key/model (caller meters credits);
 * - self-hosted: the user's own stored model + decrypted key (BYOK, no limit).
 * Throws 503 when self-hosted but the user hasn't configured a key yet.
 */
export async function resolveAiConfig(userId: string): Promise<EffectiveAiConfig> {
  if (cloudHosted()) {
    return { cloud: true, model: config.chat.model, apiKey: config.chat.apiKey };
  }
  const s = await repo.get(userId);
  if (!s?.apiKeyEnc) {
    throw ServiceUnavailable('Configure your AI provider and API key in Settings → AI');
  }
  return { cloud: false, model: s.model, apiKey: decryptSecret(s.apiKeyEnc) };
}

export async function getSettings(userId: string): Promise<AiSettingsView> {
  const cloud = cloudHosted();
  const s = cloud ? null : await repo.get(userId);
  return {
    cloudHosted: cloud,
    model: cloud ? config.chat.model : (s?.model ?? DEFAULT_CHAT_MODEL),
    hasKey: cloud ? true : Boolean(s?.apiKeyEnc),
    models: CHAT_MODELS,
    credits: cloud ? await getCredits(userId) : null,
  };
}

export async function updateSettings(
  userId: string,
  input: AiSettingsUpdateInput,
): Promise<AiSettingsView> {
  if (cloudHosted()) {
    throw Forbidden('AI settings are managed by your workspace in cloud-hosted mode');
  }
  if (input.model && !isKnownChatModel(input.model)) throw BadRequest('Unknown model');
  const current = await repo.get(userId);
  const model = input.model ?? current?.model ?? DEFAULT_CHAT_MODEL;
  await repo.upsert(userId, {
    provider: providerOf(model),
    model,
    apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : undefined,
  });
  return getSettings(userId);
}

export async function deleteKey(userId: string): Promise<AiSettingsView> {
  if (cloudHosted()) {
    throw Forbidden('AI settings are managed by your workspace in cloud-hosted mode');
  }
  await repo.clearKey(userId);
  return getSettings(userId);
}
