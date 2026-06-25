import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { EmptyState, SearchEmptyArt } from '../components/Illustrations';
import { TaskEditor } from '../components/TaskEditor';
import { useI18n } from '../i18n';
import type { AskResult, Label, Project, Task, TaskHit } from '../types';

export function SearchAskView({ projects, labels, onChanged }: { projects: Project[]; labels: Label[]; onChanged: () => void }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Task | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<TaskHit[] | null>(null);
  const [answer, setAnswer] = useState<AskResult | null>(null);
  const [busy, setBusy] = useState<'search' | 'ask' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(mode: 'search' | 'ask') {
    if (!q.trim()) return;
    setErr(null);
    setBusy(mode);
    try {
      if (mode === 'search') {
        setHits(await api.search(q));
        setAnswer(null);
      } else {
        setAnswer(await api.ask(q));
        setHits(null);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-8">
      <h1 className="mb-4 text-xl font-bold text-ink">{t('nav.search')}</h1>

      <div className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run('search')}
          placeholder={t('search.placeholder')}
          className="flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
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

      {hits && hits.length === 0 && (
        <EmptyState art={<SearchEmptyArt className="h-full w-full" />} title={t('search.noMatch')} subtitle={t('search.noMatchHint')} />
      )}
      {hits && hits.length > 0 && (
        <ul className="mt-5 divide-y divide-line">
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
