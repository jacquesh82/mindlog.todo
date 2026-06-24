import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import type { AiLog, AiUsage, ApiKey } from '../types';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<ApiKey | null>(null);

  const reload = () => void api.listApiKeys().then(setKeys);
  useEffect(reload, []);

  async function create() {
    setCreated(await api.createApiKey(name || undefined));
    setName('');
    reload();
  }

  return (
    <Card title="🔑 API keys (for MCP)">
      <p className="mb-3 text-sm text-muted">
        Use a key as a Bearer token with the MCP server. Keys act only on your own tasks.
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name (optional)"
          className="flex-1 rounded-md border border-line px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={create}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
        >
          Generate key
        </button>
      </div>
      {created?.secret && (
        <div className="mt-3 rounded-md border border-brand bg-brand-soft p-3 text-sm">
          <div className="font-medium">Copy now — shown only once:</div>
          <code className="break-all">{created.secret}</code>
        </div>
      )}
      <ul className="mt-3 divide-y divide-line">
        {keys.length === 0 && <li className="py-2 text-sm text-muted">No keys yet.</li>}
        {keys.map((k) => (
          <li key={k.id} className="flex items-center gap-3 py-2 text-sm">
            <code className="rounded bg-line/60 px-1.5">{k.prefix}…</code>
            <span className="flex-1 text-muted">{k.name}</span>
            <button onClick={() => void api.deleteApiKey(k.id).then(reload)} className="text-[var(--color-p1)] hover:underline">
              Revoke
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AiActivityCard() {
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void api.aiUsage().then(setUsage);
    void api.aiLogs(50).then(setLogs);
  }, []);

  return (
    <Card title="🤖 AI activity & token usage">
      {usage && (
        <div className="mb-4 grid grid-cols-4 gap-3 text-center">
          <Stat label="Calls" value={usage.calls} />
          <Stat label="Input tokens" value={usage.inputTokens} />
          <Stat label="Output tokens" value={usage.outputTokens} />
          <Stat label="Total tokens" value={usage.totalTokens} highlight />
        </div>
      )}
      {logs.length === 0 ? (
        <p className="text-sm text-muted">No AI calls yet. Ask a question to see prompts, responses and token counts here.</p>
      ) : (
        <ul className="divide-y divide-line">
          {logs.map((l) => (
            <li key={l.id} className="py-2 text-sm">
              <button
                onClick={() => setOpen(open === l.id ? null : l.id)}
                className="flex w-full items-center gap-2 text-left"
              >
                <span className="rounded bg-line/60 px-1.5 text-xs">{l.kind}</span>
                <span className="flex-1 truncate text-ink">{l.prompt}</span>
                <span className="text-xs text-muted">
                  {l.inputTokens}+{l.outputTokens} tok
                </span>
                <span className="text-muted">{open === l.id ? '▾' : '▸'}</span>
              </button>
              {open === l.id && (
                <div className="mt-2 space-y-2 rounded-md bg-sidebar p-3 text-xs">
                  <div>
                    <div className="font-semibold text-muted">Prompt</div>
                    <pre className="whitespace-pre-wrap break-words text-ink">{l.prompt}</pre>
                  </div>
                  <div>
                    <div className="font-semibold text-muted">Response</div>
                    <pre className="whitespace-pre-wrap break-words text-ink">{l.response}</pre>
                  </div>
                  <div className="text-muted">
                    {l.model} · {new Date(l.createdAt).toLocaleString()}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border border-line p-3 ${highlight ? 'bg-brand-soft' : ''}`}>
      <div className={`text-lg font-semibold ${highlight ? 'text-brand' : 'text-ink'}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-8">
      <h1 className="mb-4 text-xl font-bold text-ink">{t('nav.settings')}</h1>
      <AiActivityCard />
      <ApiKeysCard />
    </div>
  );
}
