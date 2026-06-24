import { authService, closePool } from '@mindlog/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp/tools.js';

// IMPORTANT: stdout is the MCP protocol channel here — only log to stderr.
async function main(): Promise<void> {
  const key = process.env.MINDLOG_API_KEY ?? '';
  const userId = await authService.resolveApiKey(key);
  if (!userId) {
    console.error('[mindlog] MINDLOG_API_KEY is missing or invalid. Create an API key in the web UI.');
    process.exit(1);
  }

  const server = createMcpServer(userId);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mindlog] MCP stdio server ready.');

  const shutdown = () => {
    void server.close();
    void closePool().then(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[mindlog] stdio fatal error:', err);
  process.exit(1);
});
