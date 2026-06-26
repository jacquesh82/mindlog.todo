import { useState } from 'react';
import { api } from '../api/client';
import { useDialog } from '../dialog';
import { formatDue, PRIORITY_COLOR } from '../format';
import { useI18n } from '../i18n';
import type { Label } from '../types';
import type { TreeTask } from '../tree';

interface Props {
  task: TreeTask;
  labels: Map<string, Label>;
  onChanged: () => void;
  onEdit: (task: TreeTask) => void;
  depth?: number;
}

/** A Todoist-style task row with nested sub-tasks and an add-subtask affordance. */
export function TaskRow({ task, labels, onChanged, onEdit, depth = 0 }: Props) {
  const { lang, t } = useI18n();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [subTitle, setSubTitle] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const done = task.status === 'done';
  const hasChildren = task.children.length > 0;

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
    if (!(await dialog.confirm({ title: t('common.deleteConfirm'), danger: true, confirmLabel: t('task.delete') }))) return;
    setBusy(true);
    try {
      await api.deleteTask(task.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function addSub() {
    if (!subTitle.trim()) return;
    await api.createTask({
      title: subTitle.trim(),
      parentId: task.id,
      projectId: task.projectId ?? undefined,
    });
    setSubTitle('');
    setAddingSub(false);
    onChanged();
  }

  const due = task.dueDate ? formatDue(task.dueDate, lang, t) : null;
  const dueTone = {
    overdue: 'text-[var(--color-p1)]',
    today: 'text-green-600',
    soon: 'text-[var(--color-p3)]',
    normal: 'text-muted',
  };

  return (
    <li>
      <div className="group flex items-start gap-2 border-b border-line py-2 pr-2" style={{ paddingLeft: depth * 20 + 4 }}>
        {hasChildren ? (
          <button onClick={() => setCollapsed((c) => !c)} className="mt-0.5 w-4 text-muted hover:text-ink" aria-label="toggle">
            {collapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <button
          onClick={complete}
          disabled={busy}
          aria-label={t('task.completed')}
          className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition hover:opacity-80"
          style={{ borderColor: PRIORITY_COLOR[task.priority] }}
        >
          {done && <span className="h-[10px] w-[10px] rounded-full" style={{ backgroundColor: PRIORITY_COLOR[task.priority] }} />}
        </button>

        <div className="min-w-0 flex-1">
          <button
            onClick={() => onEdit(task)}
            className={`block text-left text-sm leading-snug hover:text-brand ${done ? 'text-muted line-through' : 'text-ink'}`}
          >
            {task.title}
          </button>
          {task.description && <div className="mt-0.5 truncate text-xs text-muted">{task.description}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {due && <span className={dueTone[due.tone]}>📅 {due.text}</span>}
            {task.recurrence && <span className="text-muted">🔁 {task.recurrence}</span>}
            {hasChildren && <span className="text-muted">↳ {task.children.length}</span>}
            {task.labelIds.map((id) => {
              const label = labels.get(id);
              if (!label) return null;
              return (
                <span key={id} className="rounded px-1.5 py-0.5" style={{ color: label.color ?? 'var(--color-muted)', backgroundColor: (label.color ?? '#808080') + '22' }}>
                  @{label.name}
                </span>
              );
            })}
          </div>
        </div>

        <button onClick={() => setAddingSub((v) => !v)} title={t('task.addSub')} className="opacity-0 transition group-hover:opacity-100 text-muted hover:text-brand">
          ＋
        </button>
        <button onClick={remove} disabled={busy} title={t('task.delete')} className="opacity-0 transition group-hover:opacity-100 text-muted hover:text-[var(--color-p1)]">
          🗑
        </button>
      </div>

      {addingSub && (
        <div style={{ paddingLeft: depth * 20 + 44 }} className="py-1">
          <input
            autoFocus
            value={subTitle}
            onChange={(e) => setSubTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addSub();
              if (e.key === 'Escape') setAddingSub(false);
            }}
            onBlur={() => setAddingSub(false)}
            placeholder={t('task.addSub')}
            className="w-full rounded border border-line px-2 py-1 text-sm outline-none focus:border-brand"
          />
        </div>
      )}

      {!collapsed && hasChildren && (
        <ul>
          {task.children.map((child) => (
            <TaskRow key={child.id} task={child} labels={labels} onChanged={onChanged} onEdit={onEdit} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
