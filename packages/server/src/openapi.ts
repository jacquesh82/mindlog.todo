import {
  apiKeyCreateSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  taskAskSchema,
  taskCreateSchema,
  taskSearchSchema,
  taskUpdateSchema,
  TASK_STATUSES,
  config,
} from '@mindlog/core';
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// --- Response schemas (documentation shapes) ---
const ErrorSchema = z
  .object({ error: z.string(), message: z.string(), details: z.array(z.any()).optional() })
  .openapi('Error');

const TaskSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    parentId: z.string().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    assignee: z.string().nullable(),
    dueDate: z.string().nullable(),
    status: z.enum(TASK_STATUSES),
    progress: z.number(),
    position: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Task');

const TaskHitSchema = TaskSchema.extend({ score: z.number() }).openapi('TaskSearchHit');

const UserSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    displayName: z.string().nullable(),
    googleSub: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('User');

const AuthSchema = z
  .object({
    user: UserSchema,
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number(),
  })
  .openapi('AuthResult');

const ApiKeySchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    prefix: z.string(),
    createdAt: z.string(),
    lastUsedAt: z.string().nullable(),
  })
  .openapi('ApiKey');

const ApiKeyCreatedSchema = ApiKeySchema.extend({ secret: z.string() }).openapi('ApiKeyCreated');

const AskResultSchema = z
  .object({ answer: z.string(), sources: z.array(TaskSchema) })
  .openapi('AskResult');

function buildDocument() {
  const r = new OpenAPIRegistry();

  r.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    description: 'JWT access token, or an API key (`mlt_…`).',
  });

  const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
  const secured = [{ bearerAuth: [] as string[] }];

  // Auth
  r.registerPath({
    method: 'post', path: '/api/v1/auth/register', tags: ['auth'],
    request: { body: json(registerSchema) },
    responses: { 201: { description: 'Created', ...json(AuthSchema) }, 409: { description: 'Email taken', ...json(ErrorSchema) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/auth/login', tags: ['auth'],
    request: { body: json(loginSchema) },
    responses: { 200: { description: 'OK', ...json(AuthSchema) }, 401: { description: 'Invalid', ...json(ErrorSchema) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/auth/refresh', tags: ['auth'],
    request: { body: json(refreshSchema) },
    responses: { 200: { description: 'OK', ...json(AuthSchema) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/auth/logout', tags: ['auth'],
    request: { body: json(refreshSchema) },
    responses: { 204: { description: 'No content' } },
  });

  // Account
  r.registerPath({
    method: 'get', path: '/api/v1/me', tags: ['account'], security: secured,
    responses: { 200: { description: 'OK', ...json(UserSchema) } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/api-keys', tags: ['account'], security: secured,
    responses: { 200: { description: 'OK', ...json(z.array(ApiKeySchema)) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/api-keys', tags: ['account'], security: secured,
    request: { body: json(apiKeyCreateSchema) },
    responses: { 201: { description: 'Created (secret shown once)', ...json(ApiKeyCreatedSchema) } },
  });
  r.registerPath({
    method: 'delete', path: '/api/v1/api-keys/{id}', tags: ['account'], security: secured,
    request: { params: z.object({ id: z.string() }) },
    responses: { 204: { description: 'Revoked' } },
  });

  // Tasks
  r.registerPath({
    method: 'post', path: '/api/v1/tasks', tags: ['tasks'], security: secured,
    request: { body: json(taskCreateSchema) },
    responses: { 201: { description: 'Created', ...json(TaskSchema) } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/tasks', tags: ['tasks'], security: secured,
    request: {
      query: z.object({
        status: z.enum(TASK_STATUSES).optional(),
        assignee: z.string().optional(),
        parentId: z.string().optional(),
        root: z.boolean().optional(),
        tree: z.boolean().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }),
    },
    responses: { 200: { description: 'OK', ...json(z.array(TaskSchema)) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/tasks/search', tags: ['tasks'], security: secured,
    request: { body: json(taskSearchSchema) },
    responses: { 200: { description: 'OK', ...json(z.array(TaskHitSchema)) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/tasks/ask', tags: ['tasks'], security: secured,
    request: { body: json(taskAskSchema) },
    responses: { 200: { description: 'OK', ...json(AskResultSchema) } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/tasks/{id}', tags: ['tasks'], security: secured,
    request: { params: z.object({ id: z.string() }), query: z.object({ withChildren: z.boolean().optional() }) },
    responses: { 200: { description: 'OK', ...json(TaskSchema) }, 404: { description: 'Not found', ...json(ErrorSchema) } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/tasks/{id}/subtasks', tags: ['tasks'], security: secured,
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: 'OK', ...json(z.array(TaskSchema)) } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/tasks/{id}/subtasks', tags: ['tasks'], security: secured,
    request: { params: z.object({ id: z.string() }), body: json(taskCreateSchema) },
    responses: { 201: { description: 'Created', ...json(TaskSchema) } },
  });
  r.registerPath({
    method: 'patch', path: '/api/v1/tasks/{id}', tags: ['tasks'], security: secured,
    request: { params: z.object({ id: z.string() }), body: json(taskUpdateSchema) },
    responses: { 200: { description: 'OK', ...json(TaskSchema) } },
  });
  r.registerPath({
    method: 'delete', path: '/api/v1/tasks/{id}', tags: ['tasks'], security: secured,
    request: { params: z.object({ id: z.string() }) },
    responses: { 204: { description: 'Deleted' } },
  });

  const generator = new OpenApiGeneratorV31(r.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'mindlog.todo API',
      version: '0.0.0',
      description: 'Task management REST API. The same service core also backs the MCP server.',
      license: { name: 'AGPL-3.0-or-later', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
    },
    servers: [{ url: config.publicUrl }],
  });
}

/** Build the OpenAPI document, falling back to a minimal stub if generation fails. */
export function getOpenApiDocument(): object {
  try {
    return buildDocument();
  } catch (err) {
    console.error('[openapi] generation failed, serving minimal document:', err);
    return {
      openapi: '3.1.0',
      info: { title: 'mindlog.todo API', version: '0.0.0' },
      paths: {},
    };
  }
}
