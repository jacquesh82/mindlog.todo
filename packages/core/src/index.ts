// Public surface of the shared service core. The REST API and the MCP server
// both build on these exports — no business logic lives outside `core`.

export { config, googleEnabled, type EmbeddingProviderId } from './config.js';
export { AppError, BadRequest, Conflict, NotFound, ServiceUnavailable, Unauthorized } from './errors.js';

// Domain types & validation schemas
export * from './domain/task.js';
export * from './domain/recurrence.js';
export * from './domain/quickadd.js';
export * from './domain/project.js';
export * from './domain/section.js';
export * from './domain/label.js';
export * from './domain/user.js';

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
export * as authService from './service/auth.service.js';
export { askTasks } from './rag/ask.js';
