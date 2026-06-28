import { authService, closePool } from '@mindlog/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/mcp/tools.js';
import { ensureSchema, resetDb } from './helpers.js';

/** Register a user and return an MCP client connected to a server scoped to them. */
async function connectFor(email: string) {
  const { user } = await authService.register({ email, password: 'password123' });
  const server = createMcpServer(user.id);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientTransport);
  return { client, userId: user.id };
}

function parse(result: { content: Array<{ type: string; text?: string }> }) {
  const text = result.content.find((c) => c.type === 'text')?.text ?? 'null';
  return JSON.parse(text);
}

beforeAll(async () => {
  await ensureSchema();
});
beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePool();
});

describe('mcp tools', () => {
  it('exposes the full task toolset', async () => {
    const { client } = await connectFor('m1@ex.com');
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(
      [
        'task_ask',
        'task_create',
        'task_delete',
        'task_get',
        'task_list',
        'task_query',
        'task_quick_add',
        'task_search',
        'task_update',
        'project_list',
        'project_create',
        'project_update',
        'project_delete',
        'section_list',
        'section_create',
        'section_update',
        'section_delete',
        'label_list',
        'label_create',
        'label_update',
        'label_delete',
        'filter_list',
        'filter_create',
        'filter_update',
        'filter_delete',
        'filter_run',
      ].sort(),
    );
    await client.close();
  });

  it('creates, lists, gets, updates and deletes tasks', async () => {
    const { client } = await connectFor('m2@ex.com');

    const created = parse(
      await client.callTool({ name: 'task_create', arguments: { title: 'From MCP', progress: 10 } }),
    );
    expect(created.title).toBe('From MCP');

    const listed = parse(await client.callTool({ name: 'task_list', arguments: {} }));
    expect(listed).toHaveLength(1);

    const got = parse(await client.callTool({ name: 'task_get', arguments: { id: created.id } }));
    expect(got.id).toBe(created.id);

    const updated = parse(
      await client.callTool({ name: 'task_update', arguments: { id: created.id, status: 'done', progress: 100 } }),
    );
    expect(updated.status).toBe('done');
    expect(updated.progress).toBe(100);

    const del = parse(await client.callTool({ name: 'task_delete', arguments: { id: created.id } }));
    expect(del.deleted).toBe(true);

    const empty = parse(await client.callTool({ name: 'task_list', arguments: {} }));
    expect(empty).toHaveLength(0);
    await client.close();
  });

  it('manages projects, sections, labels and filters', async () => {
    const { client } = await connectFor('mplf@ex.com');

    // Project + section
    const project = parse(
      await client.callTool({ name: 'project_create', arguments: { name: 'Launch' } }),
    );
    expect(project.name).toBe('Launch');
    const projects = parse(await client.callTool({ name: 'project_list', arguments: {} }));
    expect(projects.some((p: { id: string }) => p.id === project.id)).toBe(true);
    const section = parse(
      await client.callTool({
        name: 'section_create',
        arguments: { projectId: project.id, name: 'Todo' },
      }),
    );
    expect(section.name).toBe('Todo');
    expect(parse(await client.callTool({ name: 'section_list', arguments: { projectId: project.id } }))).toHaveLength(1);

    // Label
    const label = parse(
      await client.callTool({ name: 'label_create', arguments: { name: 'urgent' } }),
    );
    expect(label.name).toBe('urgent');
    expect(parse(await client.callTool({ name: 'label_list', arguments: {} }))).toHaveLength(1);

    // Filter create + run
    const filter = parse(
      await client.callTool({ name: 'filter_create', arguments: { name: 'P1s', query: 'p1' } }),
    );
    expect(filter.query).toBe('p1');
    await client.callTool({
      name: 'task_create',
      arguments: { title: 'Urgent thing', priority: 1, projectId: project.id },
    });
    const hits = parse(await client.callTool({ name: 'filter_run', arguments: { id: filter.id } }));
    expect(hits.length).toBe(1);
    const adHoc = parse(await client.callTool({ name: 'task_query', arguments: { query: 'p1' } }));
    expect(adHoc.length).toBe(1);

    // Cleanup deletes
    expect(parse(await client.callTool({ name: 'filter_delete', arguments: { id: filter.id } })).deleted).toBe(true);
    expect(parse(await client.callTool({ name: 'label_delete', arguments: { id: label.id } })).deleted).toBe(true);
    expect(parse(await client.callTool({ name: 'project_delete', arguments: { id: project.id } })).deleted).toBe(true);
    await client.close();
  });

  it('creates sub-tasks and lists them as a tree', async () => {
    const { client } = await connectFor('m3@ex.com');
    const root = parse(await client.callTool({ name: 'task_create', arguments: { title: 'Parent' } }));
    const child = parse(
      await client.callTool({ name: 'task_create', arguments: { title: 'Child', parentId: root.id } }),
    );
    expect(child.parentId).toBe(root.id);

    const tree = parse(await client.callTool({ name: 'task_list', arguments: { tree: true } }));
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    await client.close();
  });

  it('semantic search finds the relevant task', async () => {
    const { client } = await connectFor('m4@ex.com');
    await client.callTool({ name: 'task_create', arguments: { title: 'Quarterly financial report' } });
    await client.callTool({ name: 'task_create', arguments: { title: 'Water the plants' } });
    const hits = parse(await client.callTool({ name: 'task_search', arguments: { query: 'financial report' } }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toBe('Quarterly financial report');
    await client.close();
  });

  it('scopes tools to the API key owner', async () => {
    const a = await connectFor('m5a@ex.com');
    await a.client.callTool({ name: 'task_create', arguments: { title: 'a-secret' } });
    const b = await connectFor('m5b@ex.com');
    const bList = parse(await b.client.callTool({ name: 'task_list', arguments: {} }));
    expect(bList).toHaveLength(0);
    await a.client.close();
    await b.client.close();
  });
});
