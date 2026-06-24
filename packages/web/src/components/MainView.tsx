import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { startOfToday, startOfTomorrow } from '../format';
import { useI18n } from '../i18n';
import type { Filter, Label, Project, Task } from '../types';
import type { View } from '../app/view';
import { TaskRow } from './TaskRow';
import { QuickAdd } from './QuickAdd';

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
    case 'inbox': return t('nav.inbox');
    case 'project': return projects.find((p) => p.id === view.id)?.name ?? '';
    case 'label': return '@' + (labels.find((l) => l.id === view.id)?.name ?? '');
    case 'filter': return filters.find((f) => f.id === view.id)?.name ?? '';
    case 'settings': return '';
  }
}

async function loadTasks(view: View): Promise<Task[]> {
  switch (view.kind) {
    case 'today':
      return api.listTasks({ completed: 'false', dueBefore: startOfTomorrow().toISOString() });
    case 'upcoming':
      return api.listTasks({ completed: 'false', dueAfter: startOfToday().toISOString() });
    case 'inbox':
      return api.listTasks({ projectId: view.id, completed: 'false' });
    case 'project':
      return api.listTasks({ projectId: view.id });
    case 'label':
      return api.listTasks({ labelId: view.id, completed: 'false' });
    case 'filter':
      return api.runFilter(view.id);
    case 'settings':
      return [];
  }
}

export function MainView({ view, projects, labels, filters, onDataChanged }: Props) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const labelMap = new Map(labels.map((l) => [l.id, l]));
  const defaultProjectId =
    view.kind === 'project' || view.kind === 'inbox' ? view.id : undefined;

  const reload = useCallback(() => {
    setLoading(true);
    loadTasks(view)
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [view]);

  useEffect(() => {
    reload();
  }, [reload]);

  const changed = () => {
    reload();
    onDataChanged();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-8">
      <h1 className="mb-4 text-xl font-bold text-ink">
        {titleFor(view, projects, labels, filters, t)}
      </h1>

      {view.kind !== 'filter' && view.kind !== 'label' && (
        <QuickAdd defaultProjectId={defaultProjectId} onAdded={changed} />
      )}

      {loading ? (
        <p className="mt-6 text-sm text-muted">{t('common.loading')}</p>
      ) : tasks.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">{t('task.empty')}</p>
      ) : (
        <ul className="mt-2">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} labels={labelMap} onChanged={changed} />
          ))}
        </ul>
      )}
    </div>
  );
}
