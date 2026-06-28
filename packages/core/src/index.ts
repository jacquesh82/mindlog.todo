// Public surface of the shared service core. The REST API and the MCP server
// both build on these exports — no business logic lives outside `core`.

export {
  config,
  cloudHosted,
  googleEnabled,
  mindlogIdEnabled,
  mailEnabled,
  type EmbeddingProviderId,
} from './config.js';
export {
  AppError,
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
  PaymentRequired,
  QuotaExceeded,
  ServiceUnavailable,
  Unauthorized,
} from './errors.js';

// Domain types & validation schemas
export * from './domain/task.js';
export * from './domain/recurrence.js';
export * from './domain/quickadd.js';
export * from './domain/filter-query.js';
export * from './domain/filter.js';
export * from './domain/project.js';
export * from './domain/section.js';
export * from './domain/label.js';
export * from './domain/attachment.js';
export * from './domain/calendar.js';
export * from './domain/note.js';
export * from './domain/ai-log.js';
export * from './domain/ai-settings.js';
export * from './domain/dashboard.js';
export * from './domain/karma.js';
export * from './domain/user.js';
export {
  CHAT_MODELS,
  CHAT_PROVIDERS,
  type ChatModel,
  type ChatProvider,
  type ChatProviderId,
} from './llm/models.js';

// Database lifecycle
export { migrate } from './db/migrate.js';
export { getPool, closePool } from './db/pool.js';

// Auth primitives used by the server's middleware
export { signAccessToken, verifyAccessToken } from './auth/jwt.js';

// Embeddings (RAG)
export { getEmbeddingProvider, embedOne, type EmbeddingProvider } from './embeddings/provider.js';

// Services — the canonical entry points
export * as taskService from './service/task.service.js';
export * as projectService from './service/project.service.js';
export * as sectionService from './service/section.service.js';
export * as labelService from './service/label.service.js';
export * as filterService from './service/filter.service.js';
export * as aiLogService from './service/ai-log.service.js';
export * as karmaService from './service/karma.service.js';
export * as attachmentService from './service/attachment.service.js';
export * as calendarService from './service/calendar.service.js';
export * as noteService from './service/note.service.js';
export * as authService from './service/auth.service.js';
export * as aiService from './service/ai.service.js';
export * as dashboardService from './service/dashboard.service.js';
export * as oauthService from './service/oauth.service.js';
export { OAuthError } from './service/oauth.service.js';
export * as exportService from './service/export.service.js';
export { askTasks } from './rag/ask.js';

// Change bus — REST & MCP write paths emit here; the SSE endpoint subscribes.
export { emitChange, subscribeChanges, type ChangeEvent, type ChangeEntity } from './service/changes.js';
