import { decryptSecret, encryptSecret } from '../auth/crypto.js';
import { cloudHosted, config } from '../config.js';
import type { AiSettingsUpdateInput, AiSettingsView } from '../domain/ai-settings.js';
import { Forbidden, ServiceUnavailable } from '../errors.js';
import { listProviderModels } from '../llm/list-models.js';
import {
  CHAT_MODELS,
  CHAT_PROVIDERS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_CHAT_PROVIDER,
  isChatProvider,
  providerOf,
  type ChatProviderId,
} from '../llm/models.js';
import * as repo from '../repository/ai-settings.repo.js';
import { getCredits } from './ai-log.service.js';

export interface EffectiveAiConfig {
  /** True when using the shared server key (credits metered). */
  cloud: boolean;
  provider: ChatProviderId;
  model: string;
  apiKey: string;
}

function asProvider(v: string | undefined, fallback: ChatProviderId): ChatProviderId {
  return v && isChatProvider(v) ? v : fallback;
}

/**
 * Resolve which provider/model/key to use for a user's AI call:
 * - cloud-hosted: the shared server config (caller meters credits);
 * - self-hosted: the user's own stored provider/model + decrypted key (BYOK).
 * Throws 503 when self-hosted but the user hasn't configured a key yet.
 */
export async function resolveAiConfig(userId: string): Promise<EffectiveAiConfig> {
  if (cloudHosted()) {
    return {
      cloud: true,
      provider: asProvider(config.chat.provider, providerOf(config.chat.model)),
      model: config.chat.model,
      apiKey: config.chat.apiKey,
    };
  }
  const s = await repo.get(userId);
  if (!s?.apiKeyEnc) {
    throw ServiceUnavailable('Configure your AI provider and API key in Settings → AI');
  }
  return {
    cloud: false,
    provider: asProvider(s.provider, providerOf(s.model)),
    model: s.model,
    apiKey: decryptSecret(s.apiKeyEnc),
  };
}

export async function getSettings(userId: string): Promise<AiSettingsView> {
  const cloud = cloudHosted();
  const s = cloud ? null : await repo.get(userId);
  return {
    cloudHosted: cloud,
    provider: cloud
      ? asProvider(config.chat.provider, providerOf(config.chat.model))
      : asProvider(s?.provider, DEFAULT_CHAT_PROVIDER),
    model: cloud ? config.chat.model : (s?.model ?? DEFAULT_CHAT_MODEL),
    hasKey: cloud ? true : Boolean(s?.apiKeyEnc),
    providers: CHAT_PROVIDERS,
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
  const current = await repo.get(userId);
  const provider = asProvider(input.provider, asProvider(current?.provider, DEFAULT_CHAT_PROVIDER));
  // Model can be any non-empty id (live-listed or a free-text custom one).
  const model = input.model ?? current?.model ?? DEFAULT_CHAT_MODEL;
  await repo.upsert(userId, {
    provider,
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

/**
 * List a provider's available models (self-hosted only). Uses the supplied key,
 * or the user's stored key when omitted.
 */
export async function listModels(
  userId: string,
  provider: ChatProviderId,
  apiKey?: string,
): Promise<string[]> {
  if (cloudHosted()) {
    throw Forbidden('AI settings are managed by your workspace in cloud-hosted mode');
  }
  let key = apiKey;
  if (!key) {
    const s = await repo.get(userId);
    key = s?.apiKeyEnc ? decryptSecret(s.apiKeyEnc) : undefined;
  }
  if (!key) throw ServiceUnavailable('Enter your API key first to load models');
  return listProviderModels(provider, key);
}
