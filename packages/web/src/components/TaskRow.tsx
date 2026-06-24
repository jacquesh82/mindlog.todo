import { useState } from 'react';
import { api } from '../api/client';
import { formatDue, PRIORITY_COLOR } from '../format';
import { useI18n } from '../i18n';
import type { Label, Task } from '../types';

interface Props {
  task: Task;
  labels: Map<string, Label>;
  onChanged: () => void;
  onEdit: (task: Task) => void;
}

/** A single Todoist-style task row: priority check circle, title, meta chips. */
export function TaskRow({ task, labels, onChanged, onEdit }: Props) {
  const { lang, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const done = task.status === 'done';

  async function complete() {
    setBusy(true);
    try {
      await api.updateTask(task.id, { status: done ? 'todo' : 'done' });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteTask(task.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const due = task.dueDate ? formatDue(task.dueDate, lang, t) : null;
  const dueTone = {
    overdue: 'text-[var(--color-p1)]',
    today: 'text-green-600',
    soon: 'text-[var(--color-p3)]',
    normal: 'text-muted',
  };

  return (
    <li className="group flex items-start gap-3 border-b border-line py-2 pl-1 pr-2">
      <button
        onClick={complete}
        disabled={busy}
        aria-label={t('task.completed')}
        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition hover:opacity-80"
        style={{ borderColor: PRIORITY_COLOR[task.priority] }}
      >
        {done && (
          <span
            className="h-[10px] w-[10px] rounded-full"
            style={{ backgroundColor: PRIORITY_COLOR[task.priority] }}
          />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <button
          onClick={() => onEdit(task)}
          className={`block text-left text-sm leading-snug hover:text-brand ${done ? 'text-muted line-through' : 'text-ink'}`}
        >
          {task.title}
        </button>
        {task.description && (
          <div className="mt-0.5 truncate text-xs text-muted">{task.description}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          {due && <span className={dueTone[due.tone]}>📅 {due.text}</span>}
          {task.recurrence && <span className="text-muted">🔁 {task.recurrence}</span>}
          {task.labelIds.map((id) => {
            const label = labels.get(id);
            if (!label) return null;
            return (
              <span
                key={id}
                className="rounded px-1.5 py-0.5"
                style={{
                  color: label.color ?? 'var(--color-muted)',
                  backgroundColor: (label.color ?? '#808080') + '22',
                }}
              >
                @{label.name}
              </span>
            );
          })}
        </div>
      </div>

      <button
        onClick={remove}
        disabled={busy}
        title={t('task.delete')}
        className="opacity-0 transition group-hover:opacity-100 text-muted hover:text-[var(--color-p1)]"
      >
        🗑
      </button>
    </li>
  );
}
