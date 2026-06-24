import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { resolveUserId } from '../middleware/auth.js';
import { createMcpServer } from './tools.js';

/**
 * Stateless Streamable-HTTP MCP endpoint. Each request authenticates via the
 * `Authorization: Bearer <jwt|mlt_…>` header, then gets a fresh per-request
 * server/transport scoped to that user.
 */
export function mcpHttpHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = await resolveUserId(req.header('authorization'));
    if (!userId) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: provide a Bearer API key or JWT' },
        id: null,
      });
      return;
    }

    const server = createMcpServer(userId);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
}
