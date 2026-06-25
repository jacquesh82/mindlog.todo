import { useState } from 'react';
import { api } from '../api/client';
import { useDialog } from '../dialog';
import { useI18n } from '../i18n';
import type { Filter } from '../types';
import { PROJECT_COLORS } from './ProjectModal';

interface Props {
  filter?: Filter; // undefined → create
  onClose: () => void;
  onSaved: () => void;
}

export function FilterModal({ filter, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const dialog = useDialog();
  const [name, setName] = useState(filter?.name ?? '');
  const [query, setQuery] = useState(filter?.query ?? '');
  const [color, setColor] = useState(filter?.color ?? PROJECT_COLORS[3]!);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || !query.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      if (filter) await api.updateFilter(filter.id, { name: name.trim(), query: query.trim(), color });
      else await api.createFilter({ name: name.trim(), query: query.trim(), color });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid filter');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!filter) return;
    if (!(await dialog.confirm({ title: t('common.deleteConfirm'), danger: true, confirmLabel: t('task.delete') }))) return;
    setBusy(true);
    await api.deleteFilter(filter.id);
    onSaved();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-sm font-semibold text-ink">
          {filter ? t('filter.edit') : t('filter.add')}
        </h2>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('filter.name')}
          className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          placeholder="(p1 | p2) & @work & 7 days"
          className="mt-2 w-full rounded-md border border-line px-3 py-2 font-mono text-xs outline-none focus:border-brand"
        />
        <p className="mt-1 text-xs text-muted">{t('filter.hint')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={c}
              className={`h-6 w-6 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        {err && <p className="mt-2 text-xs text-[var(--color-p1)]">{err}</p>}
        <div className="mt-4 flex items-center justify-between">
          {filter ? (
            <button onClick={() => void remove()} className="text-sm text-[var(--color-p1)] hover:underline">
              {t('task.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-ink hover:bg-line/60">
              {t('task.cancel')}
            </button>
            <button
              onClick={() => void save()}
              disabled={busy || !name.trim() || !query.trim()}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {t('task.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
