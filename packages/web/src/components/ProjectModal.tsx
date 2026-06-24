import { useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import type { Project } from '../types';

/** Todoist-like project colour palette. */
export const PROJECT_COLORS = [
  '#b8255f', '#db4c3f', '#ff9933', '#fad000', '#afb83b', '#7ecc49',
  '#299438', '#6accbc', '#158fad', '#14aaf5', '#4073ff', '#884dff',
  '#af38eb', '#eb96eb', '#e05194', '#808080',
];

interface Props {
  project?: Project; // undefined → create
  onClose: () => void;
  onSaved: () => void;
}

export function ProjectModal({ project, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState(project?.name ?? '');
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[1]!);
  const [favorite, setFavorite] = useState(project?.isFavorite ?? false);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (project) {
        await api.updateProject(project.id, { name: name.trim(), color, isFavorite: favorite });
      } else {
        await api.createProject({ name: name.trim(), color, isFavorite: favorite });
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!project || !confirm(t('project.deleteConfirm'))) return;
    setBusy(true);
    try {
      await api.deleteProject(project.id);
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-sm font-semibold text-ink">
          {project ? t('project.edit') : t('project.add')}
        </h2>

        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          placeholder={t('project.name')}
          className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <div className="mt-3">
          <span className="mb-1 block text-xs font-medium text-muted">{t('project.color')}</span>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={c}
                className={`h-6 w-6 rounded-full border-2 transition ${color === c ? 'border-ink' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
          {t('project.favorite')}
        </label>

        <div className="mt-4 flex items-center justify-between">
          <div>
            {project && !project.isInbox && (
              <button onClick={() => void remove()} className="text-sm text-[var(--color-p1)] hover:underline">
                {t('task.delete')}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-ink hover:bg-line/60">
              {t('task.cancel')}
            </button>
            <button
              onClick={() => void save()}
              disabled={busy || !name.trim()}
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
