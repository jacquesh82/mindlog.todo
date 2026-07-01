import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { EmptyState, SearchEmptyArt } from '../components/Illustrations';
import { TaskEditor } from '../components/TaskEditor';
import { useI18n } from '../i18n';
import type { AskResult, Label, NoteHit, Notebook, Project, Task, TaskHit } from '../types';

export function SearchAskView({
  projects,
  labels,
  onChanged,
  onOpenNote,
  initialMode,
}: {
  projects: Project[];
  labels: Label[];
  onChanged: () => void;
  onOpenNote: (pageId: string) => void;
  /** Which action the Enter key triggers first — set by the Search / Ask AI tabs. */
  initialMode?: 'search' | 'ask';
}) {
  const { t } = useI18n();
  // Primary action for the Enter key; follows the tab the user arrived from.
  const [mode, setMode] = useState<'search' | 'ask'>(initialMode ?? 'search');
  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);
  const [editing, setEditing] = useState<Task | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [scope, setScope] = useState<string[]>([]); // selected notebook ids (empty = all)

  useEffect(() => {
    void api.listNotebooks().then(setNotebooks);
  }, []);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<TaskHit[] | null>(null);
  const [noteHits, setNoteHits] = useState<NoteHit[] | null>(null);
  const [answer, setAnswer] = useState<AskResult | null>(null);
  const [busy, setBusy] = useState<'search' | 'ask' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(mode: 'search' | 'ask') {
    if (!q.trim()) return;
    setErr(null);
    setBusy(mode);
    try {
      if (mode === 'search') {
        const notebookIds = scope.length ? scope : undefined;
        const [taskHits, foundNotes] = await Promise.all([
          api.search(q),
          api.searchNotes(q, 10, notebookIds),
        ]);
        setHits(taskHits);
        setNoteHits(foundNotes);
        setAnswer(null);
      } else {
        setAnswer(await api.ask(q, 8, scope.length ? scope : undefined));
        setHits(null);
        setNoteHits(null);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="mb-4 text-xl font-bold text-ink">
        {mode === 'ask' ? t('nav.askAi') : t('nav.searchShort')}
      </h1>

      <div className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run(mode)}
          placeholder={t('search.placeholder')}
          className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={() => void run('search')}
          disabled={busy !== null}
          className="rounded-md border border-line px-3 py-2 text-sm hover:bg-line/60 disabled:opacity-50"
        >
          🔎 {t('search.search')}
        </button>
        <button
          onClick={() => void run('ask')}
          disabled={busy !== null}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          💬 {t('search.ask')}
        </button>
      </div>

      {notebooks.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">{t('search.scope')}</span>
          <button
            onClick={() => setScope([])}
            className={`rounded-full border px-2 py-0.5 ${scope.length === 0 ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted'}`}
          >
            {t('search.scopeAll')}
          </button>
          {notebooks.map((nb) => {
            const on = scope.includes(nb.id);
            return (
              <button
                key={nb.id}
                onClick={() => setScope((s) => (on ? s.filter((x) => x !== nb.id) : [...s, nb.id]))}
                className={`rounded-full border px-2 py-0.5 ${on ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted'}`}
              >
                📓 {nb.name}
              </button>
            );
          })}
        </div>
      )}

      {err && <p className="mt-3 text-sm text-[var(--color-p1)]">{err}</p>}
      {busy && <p className="mt-3 text-sm text-muted">{t('common.loading')}</p>}

      {answer && (
        <div className="mt-5 rounded-lg border border-line p-4">
          <p className="whitespace-pre-wrap text-sm text-ink">{answer.answer}</p>
          {answer.sources.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {answer.sources.map((s, i) => (
                <li key={s.id}>
                  <button onClick={() => setEditing(s)} className="text-muted hover:text-brand">
                    [{i + 1}] {s.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {answer.noteSources && answer.noteSources.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {answer.noteSources.map((n, i) => (
                <li key={n.id}>📓 [N{i + 1}] {n.title}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">{t('search.tokenNote')}</p>
        </div>
      )}

      {hits !== null && hits.length === 0 && (noteHits?.length ?? 0) === 0 && (
        <EmptyState art={<SearchEmptyArt className="h-full w-full" />} title={t('search.noMatch')} subtitle={t('search.noMatchHint')} />
      )}
      {hits !== null && (hits.length > 0 || (noteHits?.length ?? 0) > 0) && (
        <div className="mt-5 space-y-6">
          {hits.length > 0 && (
            <section>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('search.tasks')}</h2>
              <ul className="divide-y divide-line">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => setEditing(h)}
                      className="flex w-full items-center gap-2 py-2 text-left text-sm hover:text-brand"
                    >
                      <span className="flex-1 text-ink">{h.title}</span>
                      <span className="text-xs text-muted">{(h.score * 100).toFixed(0)}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {noteHits && noteHits.length > 0 && (
            <section>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('search.notes')}</h2>
              <ul className="divide-y divide-line">
                {noteHits.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => onOpenNote(n.id)}
                      className="flex w-full items-center gap-2 py-2 text-left text-sm hover:text-brand"
                    >
                      <span className="shrink-0">📓</span>
                      <span className="flex-1 text-ink">{n.title}</span>
                      <span className="text-xs text-muted">{(n.score * 100).toFixed(0)}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {editing && (
        <TaskEditor
          task={editing}
          projects={projects}
          labels={labels}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}
