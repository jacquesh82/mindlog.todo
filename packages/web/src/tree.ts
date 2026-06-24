import type { Task } from './types';

export interface TreeTask extends Task {
  children: TreeTask[];
}

/**
 * Rebuild the parent→child hierarchy from a flat task list. A task whose parent
 * is not present in the list (e.g. filtered out in a smart view) is treated as a
 * root so it still shows.
 */
export function buildTree(tasks: Task[]): TreeTask[] {
  const byId = new Map<string, TreeTask>(tasks.map((t) => [t.id, { ...t, children: [] }]));
  const roots: TreeTask[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export type SortMode = 'manual' | 'priority' | 'dueDate' | 'name';

const cmp: Record<SortMode, (a: Task, b: Task) => number> = {
  manual: (a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt),
  priority: (a, b) => a.priority - b.priority || a.position - b.position,
  // No due date sorts last.
  dueDate: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
  name: (a, b) => a.title.localeCompare(b.title),
};

/** Sort a tree in place (and its children recursively) by the given mode. */
export function sortTree(nodes: TreeTask[], mode: SortMode): TreeTask[] {
  nodes.sort(cmp[mode]);
  for (const n of nodes) sortTree(n.children, mode);
  return nodes;
}
