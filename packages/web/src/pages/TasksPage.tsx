import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { TaskNode } from '../components/TaskNode';
import { TASK_STATUSES, type AskResult, type Task, type TaskHit, type TaskStatus } from '../types';

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { tree: 'true' };
    api
      .listTasks(params)
      .then((all) => {
        // tree=true returns roots with nested children; filter roots by status client-side.
        setTasks(statusFilter ? all.filter((t) => t.status === statusFilter) : all);
      })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function createRoot() {
    if (!newTitle.trim()) return;
    await api.createTask({ title: newTitle.trim() });
    setNewTitle('');
    reload();
  }

  return (
    <div className="tasks-page">
      <section className="panel">
        <div className="create-row">
          <input
            placeholder="New task — what needs doing?"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createRoot()}
          />
          <button onClick={createRoot}>Add</button>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')}>
            <option value="">All statuses</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="muted">No tasks yet.</p>
        ) : (
          <ul className="task-tree">
            {tasks.map((t) => (
              <TaskNode key={t.id} task={t} reload={reload} />
            ))}
          </ul>
        )}
      </section>

      <div className="side">
        <SearchPanel />
        <AskPanel />
      </div>
    </div>
  );
}

function SearchPanel() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<TaskHit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setErr(null);
    try {
      setHits(await api.search(q));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed');
    }
  }

  return (
    <section className="panel">
      <h3>🔎 Semantic search</h3>
      <div className="create-row">
        <input value={q} placeholder="Search tasks…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} />
        <button onClick={run}>Search</button>
      </div>
      {err && <div className="error">{err}</div>}
      {hits && (
        <ul className="hits">
          {hits.length === 0 && <li className="muted">No matches.</li>}
          {hits.map((h) => (
            <li key={h.id}>
              <span className="task-title">{h.title}</span>{' '}
              <span className="muted">({(h.score * 100).toFixed(0)}%)</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AskPanel() {
  const [q, setQ] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setErr(null);
    setBusy(true);
    try {
      setResult(await api.ask(q));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ask failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h3>💬 Ask (RAG)</h3>
      <div className="create-row">
        <input value={q} placeholder="Ask about your tasks…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} />
        <button onClick={run} disabled={busy}>
          {busy ? '…' : 'Ask'}
        </button>
      </div>
      {err && <div className="error">{err}</div>}
      {result && (
        <div className="answer">
          <p>{result.answer}</p>
          {result.sources.length > 0 && (
            <ul className="hits">
              {result.sources.map((s, i) => (
                <li key={s.id}>
                  [{i + 1}] {s.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
