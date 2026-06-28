import { closePool, config, ensureSeedFile, migrate, seedFilePath } from '@mindlog/core';
import { createApp } from './rest/app.js';

async function main(): Promise<void> {
  await migrate();
  // Create the AI prompts seed file from the built-in defaults if absent.
  ensureSeedFile();
  console.log(`[mindlog] prompts seed file: ${seedFilePath()}`);

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
