import {
  askTasks,
  taskAskSchema,
  taskCreateSchema,
  taskListQuerySchema,
  taskSearchSchema,
  taskService,
  taskUpdateSchema,
  TASK_STATUSES,
} from '@mindlog/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

const statusEnum = z.enum(TASK_STATUSES);

/**
 * Build an MCP server whose tools are scoped to a single user. Each transport
 * (HTTP per request, or stdio for the whole process) supplies the resolved
 * `userId` from the presented API key.
 */
export function createMcpServer(userId: string): McpServer {
  const server = new McpServer({ name: 'mindlog-todo', version: '0.0.0' });

  server.registerTool(
    'task_create',
    {
      title: 'Create task',
      description: 'Create a task. Set parentId to create a sub-task.',
      inputSchema: {
        title: z.string(),
        description: z.string().optional(),
        assignee: z.string().optional(),
        dueDate: z.string().describe('ISO 8601 datetime').optional(),
        status: statusEnum.optional(),
        priority: z.number().int().min(1).max(4).describe('1 = P1 (urgent) … 4 = P4 (none)').optional(),
        progress: z.number().int().min(0).max(100).optional(),
        parentId: z.string().optional(),
        projectId: z.string().describe('defaults to the Inbox project').optional(),
        sectionId: z.string().optional(),
      },
    },
    async (args) => jsonResult(await taskService.createTask(userId, taskCreateSchema.parse(args))),
  );

  server.registerTool(
    'task_list',
    {
      title: 'List tasks',
      description: 'List tasks with optional filters. Use tree=true for a nested tree.',
      inputSchema: {
        status: statusEnum.optional(),
        priority: z.number().int().min(1).max(4).optional(),
        assignee: z.string().optional(),
        parentId: z.string().optional(),
        projectId: z.string().optional(),
        sectionId: z.string().optional(),
        root: z.boolean().optional(),
        tree: z.boolean().optional(),
        limit: z.number().int().optional(),
        offset: z.number().int().optional(),
      },
    },
    async (args) => jsonResult(await taskService.listTasks(userId, taskListQuerySchema.parse(args))),
  );

  server.registerTool(
    'task_get',
    {
      title: 'Get task',
      description: 'Fetch a single task by id, optionally with its sub-task tree.',
      inputSchema: { id: z.string(), withChildren: z.boolean().optional() },
    },
    async (args) =>
      jsonResult(await taskService.getTask(userId, args.id, { withChildren: args.withChildren })),
  );

  server.registerTool(
    'task_update',
    {
      title: 'Update task',
      description: 'Update task fields (status, progress, parentId to re-parent, …).',
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        assignee: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        status: statusEnum.optional(),
        priority: z.number().int().min(1).max(4).optional(),
        progress: z.number().int().min(0).max(100).optional(),
        parentId: z.string().nullable().optional(),
        projectId: z.string().nullable().optional(),
        sectionId: z.string().nullable().optional(),
      },
    },
    async ({ id, ...patch }) =>
      jsonResult(await taskService.updateTask(userId, id, taskUpdateSchema.parse(patch))),
  );

  server.registerTool(
    'task_delete',
    {
      title: 'Delete task',
      description: 'Delete a task and all its sub-tasks.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      await taskService.deleteTask(userId, id);
      return jsonResult({ deleted: true, id });
    },
  );

  server.registerTool(
    'task_search',
    {
      title: 'Semantic search',
      description: 'Semantic (vector) search over the user tasks.',
      inputSchema: {
        query: z.string(),
        k: z.number().int().min(1).max(50).optional(),
        status: statusEnum.optional(),
      },
    },
    async (args) => jsonResult(await taskService.searchTasks(userId, taskSearchSchema.parse(args))),
  );

  server.registerTool(
    'task_ask',
    {
      title: 'Ask about tasks',
      description: 'Ask a natural-language question; answered via RAG over the user tasks.',
      inputSchema: { question: z.string(), k: z.number().int().min(1).max(20).optional() },
    },
    async (args) => jsonResult(await askTasks(userId, taskAskSchema.parse(args))),
  );

  return server;
}
