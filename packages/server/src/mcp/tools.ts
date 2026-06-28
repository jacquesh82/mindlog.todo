import {
  askTasks,
  filterCreateSchema,
  filterService,
  filterUpdateSchema,
  labelCreateSchema,
  labelService,
  labelUpdateSchema,
  projectCreateSchema,
  projectService,
  projectUpdateSchema,
  PROJECT_VIEW_MODES,
  sectionCreateSchema,
  sectionService,
  sectionUpdateSchema,
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
import type { MindlogPlugin } from '../plugin.js';

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

const statusEnum = z.enum(TASK_STATUSES);

/**
 * Build an MCP server whose tools are scoped to a single user. Each transport
 * (HTTP per request, or stdio for the whole process) supplies the resolved
 * `userId` from the presented API key.
 */
export function createMcpServer(userId: string, plugins: MindlogPlugin[] = []): McpServer {
  const server = new McpServer({ name: 'mindlog-todo', version: '0.0.0' });

  server.registerTool(
    'task_quick_add',
    {
      title: 'Quick add task',
      description:
        'Create a task from one natural-language line, e.g. "Submit report tomorrow 5pm #Work @urgent p1 every week". Resolves #project and @label by name (creating missing labels).',
      inputSchema: { text: z.string() },
    },
    async ({ text }) => jsonResult(await taskService.quickAddTask(userId, text)),
  );

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
        deadline: z.string().describe('YYYY-MM-DD hard deadline').optional(),
        durationMinutes: z.number().int().positive().optional(),
        recurrence: z.string().describe('natural language, e.g. "every weekday"').optional(),
        status: statusEnum.optional(),
        priority: z.number().int().min(1).max(4).describe('1 = P1 (urgent) … 4 = P4 (none)').optional(),
        progress: z.number().int().min(0).max(100).optional(),
        parentId: z.string().optional(),
        projectId: z.string().describe('defaults to the Inbox project').optional(),
        sectionId: z.string().optional(),
        labelIds: z.array(z.string()).optional(),
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
        deadline: z.string().nullable().optional(),
        durationMinutes: z.number().int().positive().nullable().optional(),
        recurrence: z.string().nullable().optional(),
        status: statusEnum.optional(),
        priority: z.number().int().min(1).max(4).optional(),
        progress: z.number().int().min(0).max(100).optional(),
        parentId: z.string().nullable().optional(),
        projectId: z.string().nullable().optional(),
        sectionId: z.string().nullable().optional(),
        labelIds: z.array(z.string()).optional(),
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

  // --- Projects ---

  server.registerTool(
    'project_list',
    {
      title: 'List projects',
      description: 'List the user projects (the Inbox is the special is_inbox project).',
      inputSchema: { includeArchived: z.boolean().optional() },
    },
    async ({ includeArchived }) =>
      jsonResult(await projectService.listProjects(userId, includeArchived ?? false)),
  );

  server.registerTool(
    'project_create',
    {
      title: 'Create project',
      description: 'Create a project. Set parentId for a sub-project.',
      inputSchema: {
        name: z.string(),
        color: z.string().describe('#rrggbb').optional(),
        parentId: z.string().optional(),
        isFavorite: z.boolean().optional(),
        viewMode: z.enum(PROJECT_VIEW_MODES).optional(),
        position: z.number().int().min(0).optional(),
      },
    },
    async (args) =>
      jsonResult(await projectService.createProject(userId, projectCreateSchema.parse(args))),
  );

  server.registerTool(
    'project_update',
    {
      title: 'Update project',
      description: 'Update a project (rename, recolor, favorite, view mode, archive).',
      inputSchema: {
        id: z.string(),
        name: z.string().optional(),
        color: z.string().nullable().optional(),
        parentId: z.string().nullable().optional(),
        isFavorite: z.boolean().optional(),
        viewMode: z.enum(PROJECT_VIEW_MODES).optional(),
        position: z.number().int().min(0).optional(),
        archived: z.boolean().optional(),
      },
    },
    async ({ id, ...patch }) =>
      jsonResult(await projectService.updateProject(userId, id, projectUpdateSchema.parse(patch))),
  );

  server.registerTool(
    'project_delete',
    {
      title: 'Delete project',
      description: 'Delete a project and all its tasks. The Inbox cannot be deleted.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      await projectService.deleteProject(userId, id);
      return jsonResult({ deleted: true, id });
    },
  );

  // --- Sections (board columns within a project) ---

  server.registerTool(
    'section_list',
    {
      title: 'List sections',
      description: 'List the sections of a project.',
      inputSchema: { projectId: z.string() },
    },
    async ({ projectId }) => jsonResult(await sectionService.listSections(userId, projectId)),
  );

  server.registerTool(
    'section_create',
    {
      title: 'Create section',
      description: 'Create a section (board column) in a project.',
      inputSchema: {
        projectId: z.string(),
        name: z.string(),
        position: z.number().int().min(0).optional(),
      },
    },
    async (args) =>
      jsonResult(await sectionService.createSection(userId, sectionCreateSchema.parse(args))),
  );

  server.registerTool(
    'section_update',
    {
      title: 'Update section',
      description: 'Rename or reorder a section.',
      inputSchema: {
        id: z.string(),
        name: z.string().optional(),
        position: z.number().int().min(0).optional(),
      },
    },
    async ({ id, ...patch }) =>
      jsonResult(await sectionService.updateSection(userId, id, sectionUpdateSchema.parse(patch))),
  );

  server.registerTool(
    'section_delete',
    {
      title: 'Delete section',
      description: 'Delete a section; its tasks stay in the project (un-sectioned).',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      await sectionService.deleteSection(userId, id);
      return jsonResult({ deleted: true, id });
    },
  );

  // --- Labels ---

  server.registerTool(
    'label_list',
    {
      title: 'List labels',
      description: 'List the user labels (cross-project tags).',
      inputSchema: {},
    },
    async () => jsonResult(await labelService.listLabels(userId)),
  );

  server.registerTool(
    'label_create',
    {
      title: 'Create label',
      description: 'Create a label (name is unique per user, case-insensitively).',
      inputSchema: {
        name: z.string(),
        color: z.string().describe('#rrggbb').optional(),
        isFavorite: z.boolean().optional(),
      },
    },
    async (args) => jsonResult(await labelService.createLabel(userId, labelCreateSchema.parse(args))),
  );

  server.registerTool(
    'label_update',
    {
      title: 'Update label',
      description: 'Rename, recolor, or (un)favorite a label.',
      inputSchema: {
        id: z.string(),
        name: z.string().optional(),
        color: z.string().nullable().optional(),
        isFavorite: z.boolean().optional(),
      },
    },
    async ({ id, ...patch }) =>
      jsonResult(await labelService.updateLabel(userId, id, labelUpdateSchema.parse(patch))),
  );

  server.registerTool(
    'label_delete',
    {
      title: 'Delete label',
      description: 'Delete a label and remove it from all tasks.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      await labelService.deleteLabel(userId, id);
      return jsonResult({ deleted: true, id });
    },
  );

  // --- Filters (saved Todoist-style queries) ---

  server.registerTool(
    'filter_list',
    {
      title: 'List filters',
      description: 'List the user saved filters (named filter-queries).',
      inputSchema: {},
    },
    async () => jsonResult(await filterService.listFilters(userId)),
  );

  server.registerTool(
    'filter_create',
    {
      title: 'Create filter',
      description:
        'Create a saved filter, e.g. query "(p1 | p2) & @work & 7 days". Same syntax as task_query.',
      inputSchema: {
        name: z.string(),
        query: z.string(),
        color: z.string().describe('#rrggbb').optional(),
        position: z.number().int().min(0).optional(),
      },
    },
    async (args) =>
      jsonResult(await filterService.createFilter(userId, filterCreateSchema.parse(args))),
  );

  server.registerTool(
    'filter_update',
    {
      title: 'Update filter',
      description: 'Update a saved filter (name, query, color, position).',
      inputSchema: {
        id: z.string(),
        name: z.string().optional(),
        query: z.string().optional(),
        color: z.string().nullable().optional(),
        position: z.number().int().min(0).optional(),
      },
    },
    async ({ id, ...patch }) =>
      jsonResult(await filterService.updateFilter(userId, id, filterUpdateSchema.parse(patch))),
  );

  server.registerTool(
    'filter_delete',
    {
      title: 'Delete filter',
      description: 'Delete a saved filter.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      await filterService.deleteFilter(userId, id);
      return jsonResult({ deleted: true, id });
    },
  );

  server.registerTool(
    'filter_run',
    {
      title: 'Run filter',
      description: 'Run a saved filter by id and return the matching tasks.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const filter = await filterService.getFilter(userId, id);
      return jsonResult(await taskService.runFilterQuery(userId, filter.query));
    },
  );

  server.registerTool(
    'task_query',
    {
      title: 'Run a filter query',
      description:
        'Run an ad-hoc Todoist-style filter query (e.g. "today & p1 & @work") and return matching tasks.',
      inputSchema: { query: z.string() },
    },
    async ({ query }) => jsonResult(await taskService.runFilterQuery(userId, query)),
  );

  // Plugin-contributed tools (registered after the built-ins).
  for (const plugin of plugins) {
    plugin.registerMcpTools?.(server, userId);
  }

  return server;
}
