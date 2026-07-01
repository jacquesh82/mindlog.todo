import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useServerEvents } from '../api/events';
import { startOfToday, startOfTomorrow } from '../format';
import { useI18n } from '../i18n';
import type { Filter, Label, Project, Task } from '../types';
import type { View } from '../app/view';
import { buildTree, sortTree, type SortMode, type TreeTask } from '../tree';
import { CelebrationArt, EmptyState, EmptyTasksArt } from './Illustrations';
import { SortBar } from './SortBar';
import { TaskRow } from './TaskRow';
import { TaskEditor } from './TaskEditor';
import { QuickAdd } from './QuickAdd';
import { MarqueeSelect } from '../selection/MarqueeSelect';
import { SelectionBar, useSelection } from '../selection/Selection';

interface Props {
  view: View;
  projects: Project[];
  labels: Label[];
  filters: Filter[];
  onDataChanged: () => void;
}

function titleFor(
  view: View,
  projects: Project[],
  labels: Label[],
  filters: Filter[],
  t: (k: string) => string,
): string {
  switch (view.kind) {
    case 'today': return t('nav.today');
    case 'upcoming': return t('nav.upcoming');
    case 'completed': return t('nav.completed');
    case 'inbox': return t('nav.inbox');
    case 'project': return projects.find((p) => p.id === view.id)?.name ?? '';
    case 'label': return '@' + (labels.find((l) => l.id === view.id)?.name ?? '');
    case 'filter': return filters.find((f) => f.id === view.id)?.name ?? '';
    case 'search':
    case 'notes':
    case 'dashboard':
    case 'settings': return '';
  }
}

async function loadTasks(view: View, showCompleted: boolean): Promise<Task[]> {
  const completed = showCompleted ? undefined : ('false' as const);
  const withCompleted = (p: Record<string, string>) =>
    completed ? { ...p, completed } : p;
  switch (view.kind) {
    case 'today':
      return api.listTasks(withCompleted({ dueBefore: startOfTomorrow().toISOString() }));
    case 'upcoming':
      return api.listTasks(withCompleted({ dueAfter: startOfToday().toISOString() }));
    case 'completed':
      return api.listTasks({ completed: 'true' });
    case 'inbox':
      return api.listTasks(withCompleted({ projectId: view.id }));
    case 'project':
      return api.listTasks(withCompleted({ projectId: view.id }));
    case 'label':
      return api.listTasks(withCompleted({ labelId: view.id }));
    case 'filter':
      return api.runFilter(view.id);
    case 'search':
    case 'notes':
    case 'dashboard':
    case 'settings':
      return [];
  }
}

export function MainView({ view, projects, labels, filters, onDataChanged }: Props) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TreeTask | null>(null);
  const [sort, setSort] = useState<SortMode>('manual');
  const [showCompleted, setShowCompleted] = useState(false);
  const { clear } = useSelection();
  const viewKey = 'id' in view ? `${view.kind}:${view.id}` : view.kind;

  // Drop any selection when the active view changes.
  useEffect(() => clear(), [viewKey, clear]);

  const labelMap = new Map(labels.map((l) => [l.id, l]));
  const defaultProjectId =
    view.kind === 'project' || view.kind === 'inbox' ? view.id : undefined;
  const canToggleCompleted = view.kind !== 'completed' && view.kind !== 'filter';

  const reload = useCallback(() => {
    setLoading(true);
    loadTasks(view, showCompleted)
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [view, showCompleted]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Refresh the task list when the server reports a change (incl. via MCP).
  useServerEvents(reload);

  const changed = () => {
    reload();
    onDataChanged();
  };

  const tree = sortTree(buildTree(tasks), sort);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-ink">{titleFor(view, projects, labels, filters, t)}</h1>
        <SortBar
          sort={sort}
          onSort={setSort}
          showCompleted={canToggleCompleted ? showCompleted : undefined}
          onToggleCompleted={() => setShowCompleted((v) => !v)}
        />
      </div>

      {view.kind !== 'filter' && view.kind !== 'label' && view.kind !== 'completed' && (
        <QuickAdd defaultProjectId={defaultProjectId} projects={projects} labels={labels} onAdded={changed} />
      )}

      {loading ? (
        <p className="mt-6 text-sm text-muted">{t('common.loading')}</p>
      ) : tree.length === 0 ? (
        view.kind === 'completed' ? (
          <EmptyState art={<CelebrationArt className="h-full w-full" />} title={t('empty.completed')} subtitle={t('empty.completedHint')} />
        ) : view.kind === 'today' ? (
          <EmptyState art={<CelebrationArt className="h-full w-full" />} title={t('empty.today')} subtitle={t('empty.todayHint')} />
        ) : (
          <EmptyState art={<EmptyTasksArt className="h-full w-full" />} title={t('task.empty')} subtitle={t('empty.tasksHint')} />
        )
      ) : (
        <MarqueeSelect>
          <ul className="mt-2">
            {tree.map((task) => (
              <TaskRow key={task.id} task={task} labels={labelMap} onChanged={changed} onEdit={setEditing} />
            ))}
          </ul>
        </MarqueeSelect>
      )}

      <SelectionBar tasks={tasks} onReload={reload} />

      {editing && (
        <TaskEditor
          task={editing}
          projects={projects}
          labels={labels}
          onClose={() => setEditing(null)}
          onSaved={changed}
        />
      )}
    </div>
  );
}
