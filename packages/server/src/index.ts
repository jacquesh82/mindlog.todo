import { closePool, config, migrate } from '@mindlog/core';
import { createApp } from './rest/app.js';

async function main(): Promise<void> {
  await migrate();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[mindlog] REST + MCP-HTTP listening on :${config.port}`);
    console.log(`[mindlog] docs: ${config.publicUrl}/docs`);
    console.log(`[mindlog] mcp:  ${config.publicUrl}/mcp`);
  });

  const shutdown = () => {
    server.close(() => {
      void closePool().then(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[mindlog] fatal startup error:', err);
  process.exit(1);
});
