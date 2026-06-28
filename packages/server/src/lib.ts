// Library entry point for embedding the mindlog server in a host process
// (e.g. an open-core premium build). Unlike `index.ts`, importing this module
// does NOT start a server — it only exposes the composable building blocks.
export { createApp } from './rest/app.js';
export { createMcpServer } from './mcp/tools.js';
export type { MindlogPlugin, PluginMigration } from './plugin.js';
