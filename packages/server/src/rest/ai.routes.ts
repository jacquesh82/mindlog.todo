import {
  aiLogService,
  aiModelsQuerySchema,
  aiService,
  aiSettingsUpdateSchema,
  BadRequest,
  isPromptKey,
  promptSaveSchema,
  promptService,
} from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

export const aiRouter: Router = Router();
aiRouter.use(requireAuth);

function promptKey(raw: string) {
  if (!isPromptKey(raw)) throw BadRequest('Unknown prompt key');
  return raw;
}

// AI prompt templates (SYSTEM + USER) — editable in Settings → AI → Prompts.
aiRouter.get('/prompts', async (req, res) => {
  res.json(await promptService.listPrompts(userId(req)));
});

aiRouter.put('/prompts/:key', async (req, res) => {
  const key = promptKey(req.params.key!);
  res.json(await promptService.savePrompt(userId(req), key, promptSaveSchema.parse(req.body)));
});

// Reset one prompt to its seed value.
aiRouter.delete('/prompts/:key', async (req, res) => {
  res.json(await promptService.resetPrompt(userId(req), promptKey(req.params.key!)));
});

// Re-inject the built-in defaults for every prompt.
aiRouter.post('/prompts/reset', async (req, res) => {
  res.json(await promptService.resetAllPrompts(userId(req)));
});

// Sync the current prompts TO the seed file (they become the default at startup).
aiRouter.post('/prompts/seed/export', async (req, res) => {
  res.json(await promptService.exportSeed(userId(req)));
});

// Sync FROM the seed file: re-inject its prompts as the active set.
aiRouter.post('/prompts/seed/import', async (req, res) => {
  res.json(await promptService.importSeed(userId(req)));
});

aiRouter.get('/usage', async (req, res) => {
  res.json(await aiLogService.getUsage(userId(req)));
});

aiRouter.get('/logs', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  res.json(await aiLogService.listLogs(userId(req), limit));
});

// AI configuration: model + (self-hosted) the user's own provider key, or the
// metered credit balance in cloud-hosted mode.
aiRouter.get('/settings', async (req, res) => {
  res.json(await aiService.getSettings(userId(req)));
});

aiRouter.patch('/settings', async (req, res) => {
  // Throws 403 in cloud-hosted mode (user has no control over AI settings).
  res.json(await aiService.updateSettings(userId(req), aiSettingsUpdateSchema.parse(req.body)));
});

aiRouter.delete('/settings/key', async (req, res) => {
  res.json(await aiService.deleteKey(userId(req)));
});

// Live model list from the provider (uses the supplied or stored key).
aiRouter.post('/models', async (req, res) => {
  const { provider, apiKey } = aiModelsQuerySchema.parse(req.body);
  res.json({ models: await aiService.listModels(userId(req), provider, apiKey) });
});
