import { useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';

interface Props {
  defaultProjectId?: string;
  defaultSectionId?: string;
  onAdded: () => void;
}

/** Inline natural-language task capture (Todoist Quick Add). */
export function QuickAdd({ defaultProjectId, defaultSectionId, onAdded }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try {
      const task = await api.quickAdd(value);
      // In a project/inbox view, land the task here unless an explicit #project
      // was typed (the server otherwise routes label-less tasks to the Inbox).
      const patch: { projectId?: string; sectionId?: string } = {};
      if (defaultProjectId && !value.includes('#') && task.projectId !== defaultProjectId) {
        patch.projectId = defaultProjectId;
      }
      if (defaultSectionId) patch.sectionId = defaultSectionId;
      if (patch.projectId || patch.sectionId) await api.updateTask(task.id, patch);
      setText('');
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted transition hover:text-brand"
      >
        <span className="text-lg leading-none text-brand">＋</span>
        {t('task.add')}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-line p-3 shadow-sm focus-within:border-brand">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={t('task.addPlaceholder')}
        className="w-full text-sm text-ink outline-none placeholder:text-muted"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={() => {
            setOpen(false);
            setText('');
          }}
          className="rounded-md px-3 py-1.5 text-sm text-ink hover:bg-line/60"
        >
          {t('task.cancel')}
        </button>
        <button
          onClick={() => void submit()}
          disabled={busy || !text.trim()}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-hover disabled:opacity-50"
        >
          {t('task.add')}
        </button>
      </div>
    </div>
  );
}
