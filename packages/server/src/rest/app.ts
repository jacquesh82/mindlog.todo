import { getPool } from '@mindlog/core';
import cors from 'cors';
import express, { type Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { mcpHttpHandler } from '../mcp/http.js';
import { authenticate } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errors.js';
import { getOpenApiDocument } from '../openapi.js';
import { accountRouter } from './account.routes.js';
import { authRouter } from './auth.routes.js';
import { tasksRouter } from './tasks.routes.js';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      await getPool().query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  // API documentation (OpenAPI 3.1 + Swagger UI)
  const openapi = getOpenApiDocument();
  app.get('/openapi.json', (_req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  // MCP Streamable HTTP endpoint (auth handled inside the handler).
  const mcp = mcpHttpHandler();
  app.post('/mcp', mcp);
  app.get('/mcp', mcp);
  app.delete('/mcp', mcp);

  // REST API. `authenticate` only populates req.userId; routers enforce auth.
  app.use('/api/v1', authenticate);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1', accountRouter); // /me, /api-keys
  app.use('/api/v1/tasks', tasksRouter);

  app.use(errorHandler);
  return app;
}
