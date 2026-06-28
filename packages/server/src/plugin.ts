import type { Express } from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * A SQL migration contributed by a plugin. Same shape as the core migrations,
 * but applied by the host (see the plugin's own migration runner) against a
 * separate tracking table so plugin and core migration ids never collide.
 */
export interface PluginMigration {
  id: string;
  sql: string;
}

/**
 * Generic extension point for the mindlog server. A host process can pass an
 * array of plugins to {@link createApp} / {@link createMcpServer} to mount extra
 * REST routes and MCP tools without modifying core wiring. With no plugins the
 * behaviour is identical to the stock server.
 */
export interface MindlogPlugin {
  /** Stable identifier, used in logs. */
  name: string;
  /**
   * Mount additional Express routes. Called after the built-in routers and
   * before the error handler, so plugin routes sit behind the same
   * `/api/v1` `authenticate` middleware when mounted under that prefix.
   */
  registerRoutes?(app: Express): void;
  /**
   * Register additional MCP tools on a per-user server instance. Called after
   * the built-in tools, with the same resolved `userId`.
   */
  registerMcpTools?(server: McpServer, userId: string): void;
  /** SQL migrations the host should apply (host-managed tracking table). */
  migrations?: PluginMigration[];
}
