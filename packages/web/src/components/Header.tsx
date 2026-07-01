import { useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import { useToast } from '../toast';

interface Props {
  /** Called after a task is created, so the sidebar counts can refresh. */
  onAdded: () => void;
  /** Opens the mobile navigation drawer (hamburger). No-op affordance on desktop. */
  onMenu: () => void;
}

/**
 * Persistent top bar with a quick task-capture field. Stays mounted across every
 * view, so a task can be jotted down regardless of the screen currently open.
 * Submission goes through the same natural-language quick-add as the inline
 * composer (date/time + `#project` / `@label` parsing), then a toast confirms.
 */
export function Header({ onAdded, onMenu }: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const task = await api.quickAdd(value);
      setText('');
      toast(t('toast.taskCreated', { title: task.title }));
      onAdded();
    } catch {
      toast(t('header.addFailed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 md:px-4">
      {/* Hamburger — reveals the navigation drawer on phones. */}
      <button
        type="button"
        onClick={onMenu}
        aria-label={t('nav.menu')}
        className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-line/60 hover:text-ink md:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <form
        className="flex w-full max-w-2xl items-center gap-2 rounded-lg border border-line px-3 py-1.5 transition focus-within:border-brand"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="text-lg leading-none text-brand">＋</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('header.quickAdd')}
          aria-label={t('header.quickAdd')}
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-md bg-brand px-3 py-1 text-sm font-medium text-white transition hover:bg-brand-hover disabled:opacity-50"
        >
          {t('task.add')}
        </button>
      </form>
    </header>
  );
}
