import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from '@mindlog/core';
import type { Request, Response } from 'express';
import { resolveUserId } from '../middleware/auth.js';
import type { MindlogPlugin } from '../plugin.js';
import { createMcpServer } from './tools.js';

/**
 * Stateless Streamable-HTTP MCP endpoint. Each request authenticates via the
 * `Authorization: Bearer <jwt|mlt_…>` header, then gets a fresh per-request
 * server/transport scoped to that user.
 */
export function mcpHttpHandler(plugins: MindlogPlugin[] = []) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = await resolveUserId(req.header('authorization'));
    if (!userId) {
      // Point OAuth-capable clients (e.g. Claude) at our resource metadata so
      // they can discover the authorization server and run the OAuth flow.
      const metadataUrl = `${config.publicUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource`;
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${metadataUrl}"`);
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: provide a Bearer API key or JWT' },
        id: null,
      });
      return;
    }

    const server = createMcpServer(userId, plugins);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
}
