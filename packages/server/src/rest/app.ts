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
import { aiRouter } from './ai.routes.js';
import { attachmentsRouter } from './attachments.routes.js';
import { calendarRouter } from './calendar.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { filtersRouter } from './filters.routes.js';
import { karmaRouter } from './karma.routes.js';
import { labelsRouter } from './labels.routes.js';
import { notesRouter } from './notes.routes.js';
import { oauthConsentRouter, oauthRouter } from './oauth.routes.js';
import { projectsRouter } from './projects.routes.js';
import { sectionsRouter } from './sections.routes.js';
import { tasksRouter } from './tasks.routes.js';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  // Generous limit so note pages can embed pasted images (base64 data URLs).
  app.use(express.json({ limit: '15mb' }));
  // The OAuth token endpoint posts application/x-www-form-urlencoded.
  app.use(express.urlencoded({ extended: true }));

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

  // OAuth 2.1 authorization server + discovery (public, unauthenticated).
  app.use(oauthRouter);

  // REST API. `authenticate` only populates req.userId; routers enforce auth.
  app.use('/api/v1', authenticate);
  app.use('/api/v1/oauth', oauthConsentRouter); // POST /api/v1/oauth/authorize (consent)
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1', accountRouter); // /me, /api-keys
  app.use('/api/v1/projects', projectsRouter);
  app.use('/api/v1/sections', sectionsRouter);
  app.use('/api/v1/labels', labelsRouter);
  app.use('/api/v1/filters', filtersRouter);
  app.use('/api/v1/ai', aiRouter);
  app.use('/api/v1/karma', karmaRouter);
  app.use('/api/v1/calendar', calendarRouter);
  app.use('/api/v1/notes', notesRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/attachments', attachmentsRouter);
  app.use('/api/v1/tasks', tasksRouter);

  app.use(errorHandler);
  return app;
}
