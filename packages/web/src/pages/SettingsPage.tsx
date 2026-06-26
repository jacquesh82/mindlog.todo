import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useI18n, LANGS, type Lang } from '../i18n';
import { useDialog } from '../dialog';
import { useToast } from '../toast';
import { applyTheme, getInitialTheme, type Theme } from '../theme';
import type { AiLog, AiUsage, ApiKey, CalendarSource, User } from '../types';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

/** A read-only, labeled value with a one-click Copy button (+ "Copied" confirmation). */
function CopyField({
  label,
  value,
  hint,
  mono,
  empty,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  empty?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          placeholder={empty}
          onFocus={(e) => e.currentTarget.select()}
          className={`min-w-0 flex-1 rounded-md border border-line bg-sidebar px-3 py-2 text-sm text-ink outline-none placeholder:text-muted ${mono ? 'font-mono' : ''}`}
        />
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          aria-label={`${t('settings.copy')} — ${label}`}
          className="w-20 shrink-0 rounded-md border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copied ? t('settings.copied') : t('settings.copy')}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function McpConnectorCard() {
  const { t } = useI18n();
  const dialog = useDialog();
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
    <Card title={`🔌 ${t('settings.mcp')}`}>
      <p className="mb-4 text-sm text-muted">{t('settings.mcpHint')}</p>

      <div className="space-y-3">
        <CopyField label={t('settings.mcpName')} value="mindlog.todo" />
        <CopyField label={t('settings.mcpUrl')} value={api.mcpUrl()} mono />
        <CopyField label={t('settings.mcpClientId')} value="" empty={t('settings.mcpEmpty')} />
        <CopyField label={t('settings.mcpClientSecret')} value="" empty={t('settings.mcpEmpty')} />
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-1 text-sm font-semibold text-ink">{t('settings.mcpKey')}</div>
        <p className="mb-3 text-xs text-muted">{t('settings.mcpKeyHint')}</p>

        {created?.secret && (
          <div className="mb-3 rounded-md border border-brand bg-brand-soft p-3">
            <CopyField label={t('settings.mcpKeyOnce')} value={created.secret} mono />
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('settings.mcpKeyName')}
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={create}
            className="shrink-0 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            {t('settings.mcpGenerate')}
          </button>
        </div>

        <ul className="mt-3 divide-y divide-line">
          {keys.length === 0 && (
            <li className="py-2 text-sm text-muted">{t('settings.mcpNoKeys')}</li>
          )}
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 py-2 text-sm">
              <code className="rounded bg-line/60 px-1.5 font-mono">{k.prefix}…</code>
              <span className="flex-1 truncate text-muted">{k.name}</span>
              <button
                type="button"
                onClick={async () => {
                  if (
                    await dialog.confirm({
                      title: t('common.deleteConfirm'),
                      danger: true,
                      confirmLabel: t('task.delete'),
                    })
                  )
                    await api.deleteApiKey(k.id).then(reload);
                }}
                className="text-[var(--color-p1)] hover:underline"
              >
                {t('settings.revoke')}
              </button>
            </li>
          ))}
        </ul>
      </div>
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

function AccountCard() {
  const { t } = useI18n();
  const [me, setMe] = useState<User | null>(null);
  useEffect(() => {
    void api.me().then(setMe);
  }, []);
  if (!me) return null;
  return (
    <Card title={`👤 ${t('settings.account')}`}>
      <dl className="space-y-1 text-sm">
        <Row label={t('settings.name')} value={me.displayName ?? '—'} />
        <Row label={t('settings.email')} value={me.email} />
        <Row label={t('settings.memberSince')} value={new Date(me.createdAt).toLocaleDateString()} />
        <Row label={t('settings.auth')} value={me.googleSub ? 'Google' : t('settings.password')} />
      </dl>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function AppearanceCard() {
  const { t, lang, setLang } = useI18n();
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  function pickTheme(next: Theme) {
    applyTheme(next);
    setTheme(next);
  }

  return (
    <Card title={`🎨 ${t('settings.appearance')}`}>
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted">{t('settings.theme')}</span>
          <div className="flex gap-1">
            {(['light', 'dark'] as Theme[]).map((opt) => (
              <button
                key={opt}
                onClick={() => pickTheme(opt)}
                className={`rounded-md border px-3 py-1 ${theme === opt ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink'}`}
              >
                {opt === 'light' ? `☀ ${t('settings.light')}` : `🌙 ${t('settings.dark')}`}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">{t('settings.language')}</span>
          <div className="flex gap-1">
            {LANGS.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l as Lang)}
                className={`rounded-md border px-3 py-1 uppercase ${lang === l ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function CalendarSourcesCard() {
  const { t } = useI18n();
  const dialog = useDialog();
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const reload = () => void api.listCalendarSources().then(setSources);
  useEffect(reload, []);

  async function add() {
    if (!name.trim() || !url.trim()) return;
    setErr(null);
    try {
      await api.createCalendarSource({ name: name.trim(), url: url.trim(), color: '#246fe0' });
      setName('');
      setUrl('');
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <Card title={`📆 ${t('cal.sources')}`}>
      <p className="mb-3 text-sm text-muted">{t('cal.sourcesHint')}</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('cal.sourceName')}
          className="w-40 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-brand"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…/basic.ics"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-brand"
        />
        <button onClick={add} className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
          {t('cal.addSource')}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-[var(--color-p1)]">{err}</p>}
      <ul className="mt-3 divide-y divide-line">
        {sources.length === 0 && <li className="py-2 text-sm text-muted">{t('cal.noSources')}</li>}
        {sources.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color ?? '#808080' }} />
            <span className="text-ink">{s.name}</span>
            <span className="flex-1 truncate text-xs text-muted">{s.url}</span>
            <button onClick={async () => { if (await dialog.confirm({ title: t('common.deleteConfirm'), danger: true, confirmLabel: t('task.delete') })) await api.deleteCalendarSource(s.id).then(reload); }} className="text-[var(--color-p1)] hover:underline">
              {t('task.delete')}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-8">
      <h1 className="mb-4 text-xl font-bold text-ink">{t('nav.settings')}</h1>
      <AccountCard />
      <AppearanceCard />
      <CalendarSourcesCard />
      <AiActivityCard />
      <McpConnectorCard />
      <DataExportCard />
    </div>
  );
}

function DataExportCard() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `mindlog-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={`⬇️ ${t('settings.export')}`}>
      <p className="mb-3 text-sm text-muted">{t('settings.exportHint')}</p>
      <button
        onClick={download}
        disabled={busy}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
      >
        {busy ? t('common.loading') : t('settings.exportBtn')}
      </button>
    </Card>
  );
}
