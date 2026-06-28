import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api/client';
import { useDialog } from '../dialog';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import type { Task, TaskStatus } from '../types';

// Multi-select state for task rows. The provider holds a Set of selected task ids;
// the marquee (rubber-band) and Ctrl/Cmd+click feed into it; the SelectionBar acts
// on it. Escape clears the selection globally.

interface SelectionValue {
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  set: (ids: string[]) => void;
  clear: () => void;
  ids: string[];
  size: number;
}

const SelectionContext = createContext<SelectionValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const has = useCallback((id: string) => selected.has(id), [selected]);
  const toggle = useCallback((id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const set = useCallback((ids: string[]) => setSelected(new Set(ids)), []);
  const clear = useCallback(() => setSelected((cur) => (cur.size ? new Set() : cur)), []);

  // Escape clears the current selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') clear();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clear]);

  const value = useMemo<SelectionValue>(
    () => ({ has, toggle, set, clear, ids: [...selected], size: selected.size }),
    [has, toggle, set, clear, selected],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within SelectionProvider');
  return ctx;
}

/**
 * Floating action bar for the current selection. Rendered by task views and fed
 * the view's flat task list (for current statuses) and a reload callback. Returns
 * null when nothing in the selection is present in `tasks`.
 */
export function SelectionBar({ tasks, onReload }: { tasks: Task[]; onReload: () => void }) {
  const { t } = useI18n();
  const dialog = useDialog();
  const { toast } = useToast();
  const { ids, clear, set } = useSelection();

  const selectedSet = new Set(ids);
  const selectedTasks = tasks.filter((task) => selectedSet.has(task.id));
  if (selectedTasks.length === 0) return null;

  async function applyStatus(next: (task: Task) => TaskStatus) {
    const prev = selectedTasks.map((task) => ({ id: task.id, status: task.status }));
    await Promise.allSettled(selectedTasks.map((task) => api.updateTask(task.id, { status: next(task) })));
    onReload();
    clear();
    toast(t('toast.bulkUpdated', { n: prev.length }), {
      duration: 7000,
      action: {
        label: t('common.undo'),
        onAction: async () => {
          await Promise.allSettled(prev.map((p) => api.updateTask(p.id, { status: p.status })));
          onReload();
        },
      },
    });
  }

  async function removeAll() {
    const ok = await dialog.confirm({
      title: t('select.deleteConfirm', { n: selectedTasks.length }),
      danger: true,
      confirmLabel: t('task.delete'),
    });
    if (!ok) return;
    await Promise.allSettled(selectedTasks.map((task) => api.deleteTask(task.id)));
    onReload();
    clear();
    toast(t('toast.bulkDeleted', { n: selectedTasks.length }));
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-[950] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-line bg-surface px-2 py-1.5 text-sm shadow-xl">
      <span className="px-2 font-medium text-ink">{t('select.count', { n: selectedTasks.length })}</span>
      <button
        onClick={() => void set(tasks.map((task) => task.id))}
        className="rounded-md px-2 py-1 text-muted hover:bg-line/60 hover:text-ink"
      >
        {t('select.all')}
      </button>
      <span className="mx-1 h-5 w-px bg-line" />
      <button
        onClick={() => void applyStatus(() => 'done')}
        className="rounded-md px-2 py-1 text-ink hover:bg-line/60"
      >
        ✓ {t('select.check')}
      </button>
      <button
        onClick={() => void applyStatus(() => 'todo')}
        className="rounded-md px-2 py-1 text-ink hover:bg-line/60"
      >
        ○ {t('select.uncheck')}
      </button>
      <button
        onClick={() => void applyStatus((task) => (task.status === 'done' ? 'todo' : 'done'))}
        className="rounded-md px-2 py-1 text-ink hover:bg-line/60"
      >
        ⇄ {t('select.toggle')}
      </button>
      <button
        onClick={() => void removeAll()}
        className="rounded-md px-2 py-1 text-[var(--color-p1)] hover:bg-line/60"
      >
        🗑 {t('task.delete')}
      </button>
      <span className="mx-1 h-5 w-px bg-line" />
      <button
        onClick={() => clear()}
        title={t('select.clear')}
        className="rounded-md px-2 py-1 text-muted hover:bg-line/60 hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
