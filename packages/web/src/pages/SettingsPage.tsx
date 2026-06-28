import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useI18n, LANGS, type Lang } from '../i18n';
import { useDialog } from '../dialog';
import { useToast } from '../toast';
import {
  ACCENT_PRESETS,
  applyAccent,
  applyTheme,
  getInitialAccent,
  getInitialTheme,
  type Theme,
} from '../theme';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { isTourDisabled, setTourDisabled, startTour } from '../tour';
import type { AiLog, AiSettings, AiUsage, ApiKey, CalendarSource, User } from '../types';

/** Inline stroke icon (Lucide geometry) — replaces emoji so icons theme + scale cleanly. */
function Svg({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-[18px] w-[18px]'}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };
const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Svg>
);
const PaletteIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </Svg>
);
const SparklesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    <path d="M20 3v4M22 5h-4M4 17v2M5 18H3" />
  </Svg>
);
const PlugIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 22v-5M9 8V2M15 8V2" />
    <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
  </Svg>
);
const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </Svg>
);
const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M3 10h18M8 2v4M16 2v4" />
  </Svg>
);

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {icon}
        {title}
      </h2>
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
  const { toast } = useToast();
  const dialog = useDialog();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<ApiKey | null>(null);
  const [oauth, setOauth] = useState<{ clientId: string; clientSecret?: string } | null>(null);
  const [genning, setGenning] = useState(false);

  const reload = () => void api.listApiKeys().then(setKeys);
  useEffect(reload, []);

  async function create() {
    setCreated(await api.createApiKey(name || undefined));
    setName('');
    reload();
  }

  async function generateOAuth() {
    setGenning(true);
    try {
      const c = await api.createMcpOAuthClient();
      setOauth({ clientId: c.client_id, clientSecret: c.client_secret });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setGenning(false);
    }
  }

  return (
    <Card title={t('settings.mcp')} icon={<PlugIcon className="h-4 w-4" />}>
      <p className="mb-4 text-sm text-muted">{t('settings.mcpHint')}</p>

      <div className="space-y-3">
        <CopyField label={t('settings.mcpName')} value="mindlog.todo" />
        <CopyField label={t('settings.mcpUrl')} value={api.mcpUrl()} mono />
        <CopyField
          label={t('settings.mcpClientId')}
          value={oauth?.clientId ?? ''}
          empty={t('settings.mcpEmpty')}
          mono
        />
        <CopyField
          label={t('settings.mcpClientSecret')}
          value={oauth?.clientSecret ?? ''}
          empty={t('settings.mcpEmpty')}
          mono
        />
        <div>
          <button
            type="button"
            onClick={() => void generateOAuth()}
            disabled={genning}
            className="rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand disabled:opacity-60"
          >
            {t('settings.mcpGenOAuth')}
          </button>
          <p className="mt-1 text-xs text-muted">
            {oauth?.clientSecret ? t('settings.mcpGenOAuthOnce') : t('settings.mcpGenOAuthHint')}
          </p>
        </div>
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

function AiConfigCard() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [s, setS] = useState<AiSettings | null>(null);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.getAiSettings().then((x) => {
      setS(x);
      setModel(x.model);
    });
  }, []);

  if (!s) return null;

  // Cloud-hosted: the user has no control — just show their credit balance.
  if (s.cloudHosted) {
    const c = s.credits;
    const pct = c && c.limitTokens > 0 ? Math.min(100, Math.round((c.usedTokens / c.limitTokens) * 100)) : 0;
    return (
      <Card title={t('settings.ai.title')} icon={<SparklesIcon className="h-4 w-4" />}>
        <p className="mb-4 text-sm text-muted">{t('settings.ai.cloudManaged')}</p>
        {c && (
          <>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-muted">{t('settings.ai.creditsUsed')}</span>
              <span className="text-ink">
                {c.usedTokens.toLocaleString()} / {c.limitTokens.toLocaleString()} tok
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-line">
              <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {t('settings.ai.creditsReset')} {new Date(c.resetAt).toLocaleDateString()}
            </p>
          </>
        )}
      </Card>
    );
  }

  async function save() {
    setSaving(true);
    try {
      const patch: { model?: string; apiKey?: string } = { model };
      if (apiKey.trim()) patch.apiKey = apiKey.trim();
      const next = await api.updateAiSettings(patch);
      setS(next);
      setApiKey('');
      toast(t('settings.ai.saved'), 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeKey() {
    try {
      setS(await api.deleteAiKey());
      toast(t('settings.ai.keyRemoved'), 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  }

  const inputCls =
    'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand';

  return (
    <Card title={t('settings.ai.title')} icon={<SparklesIcon className="h-4 w-4" />}>
      <p className="mb-4 text-sm text-muted">{t('settings.ai.byokHint')}</p>

      <label className="mb-1 block text-sm text-muted">{t('settings.ai.model')}</label>
      <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
        {s.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      <label className="mb-1 mt-4 block text-sm text-muted">{t('settings.ai.apiKey')}</label>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={s.hasKey ? '••••••••••••' : t('settings.ai.apiKeyPlaceholder')}
        className={inputCls}
      />
      <div className="mt-1.5 flex items-center gap-3 text-xs">
        {s.hasKey && <span className="text-brand">✓ {t('settings.ai.keySet')}</span>}
        {s.hasKey && (
          <button type="button" onClick={() => void removeKey()} className="text-muted hover:text-brand">
            {t('settings.ai.removeKey')}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {t('settings.ai.save')}
      </button>
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
    <Card title="AI activity & token usage" icon={<SparklesIcon className="h-4 w-4" />}>
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
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const [me, setMe] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.me().then((u) => {
      setMe(u);
      setName(u.displayName ?? '');
      setAvatar(u.avatarUrl);
    });
  }, []);
  if (!me) return null;

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      toast(t('settings.account.avatarTooBig'), 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api.updateProfile({ displayName: name.trim() || null, avatarUrl: avatar });
      setMe(updated);
      await refreshUser();
      toast(t('settings.account.saved'), 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={t('settings.account')} icon={<UserIcon className="h-4 w-4" />}>
      <div className="mb-5 flex items-center gap-4">
        <Avatar name={name || me.email} avatarUrl={avatar} size={56} />
        <div className="flex flex-col items-start gap-1">
          <label className="cursor-pointer text-sm text-brand hover:underline">
            {t('settings.account.changeAvatar')}
            <input type="file" accept="image/*" className="hidden" onChange={pickFile} />
          </label>
          {avatar && (
            <button
              type="button"
              onClick={() => setAvatar(null)}
              className="text-xs text-muted hover:text-brand"
            >
              {t('settings.account.removeAvatar')}
            </button>
          )}
        </div>
      </div>

      <label className="mb-1 block text-sm text-muted">{t('settings.name')}</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
      />

      <dl className="mt-4 space-y-1 text-sm">
        <Row label={t('settings.email')} value={me.email} />
        <Row label={t('settings.memberSince')} value={new Date(me.createdAt).toLocaleDateString()} />
        <Row label={t('settings.auth')} value={me.googleSub ? 'Google' : t('settings.password')} />
      </dl>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {t('settings.account.save')}
      </button>
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
  const [accent, setAccent] = useState<string>(getInitialAccent);
  const [tourOff, setTourOff] = useState<boolean>(isTourDisabled);

  function pickTheme(next: Theme) {
    applyTheme(next);
    setTheme(next);
  }

  function pickAccent(next: string) {
    applyAccent(next);
    setAccent(getInitialAccent());
  }

  return (
    <Card title={t('settings.appearance')} icon={<PaletteIcon className="h-4 w-4" />}>
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
        <div className="flex items-center justify-between">
          <span className="text-muted">{t('settings.accent')}</span>
          <div className="flex items-center gap-2">
            {ACCENT_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => pickAccent(c)}
                title={c}
                aria-label={c}
                className={`h-6 w-6 rounded-full border-2 ${accent.toLowerCase() === c.toLowerCase() ? 'border-ink' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
            <label
              className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-line"
              title={t('settings.accentCustom')}
            >
              <span className="absolute inset-0 grid place-items-center text-xs text-muted">＋</span>
              <input
                type="color"
                value={accent}
                onChange={(e) => pickAccent(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">{t('settings.tour')}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => startTour(t)}
              className="rounded-md border border-line px-3 py-1 text-ink hover:border-brand"
            >
              {t('settings.tourReplay')}
            </button>
            <label className="flex items-center gap-1.5 text-muted">
              <input
                type="checkbox"
                checked={!tourOff}
                onChange={(e) => {
                  setTourDisabled(!e.target.checked);
                  setTourOff(!e.target.checked);
                }}
              />
              {t('settings.tourEnabled')}
            </label>
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
    <Card title={t('cal.sources')} icon={<CalendarIcon className="h-4 w-4" />}>
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

function MindlogIdCalendarCard() {
  const { t } = useI18n();
  const dialog = useDialog();
  const [status, setStatus] = useState<{ connected: boolean; agendaGranted: boolean } | null>(null);

  const reload = () => void api.mindlogIdCalendarStatus().then(setStatus);
  useEffect(reload, []);

  async function disconnect() {
    if (
      await dialog.confirm({
        title: t('settings.mlcal.disconnectConfirm'),
        danger: true,
        confirmLabel: t('settings.mlcal.disconnect'),
      })
    ) {
      await api.disconnectMindlogIdCalendar();
      reload();
    }
  }

  const connectedAndGranted = status?.connected && status.agendaGranted;
  const connectedNoScope = status?.connected && !status.agendaGranted;

  return (
    <Card title={t('settings.mlcal.title')} icon={<CalendarIcon className="h-4 w-4" />}>
      <p className="mb-3 text-sm text-muted">{t('settings.mlcal.hint')}</p>

      {connectedAndGranted && (
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-ink">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#8b5cf6' }} />
            {t('settings.mlcal.connectedGranted')}
          </span>
          <button
            type="button"
            onClick={disconnect}
            className="shrink-0 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-[var(--color-p1)] hover:text-[var(--color-p1)]"
          >
            {t('settings.mlcal.disconnect')}
          </button>
        </div>
      )}

      {connectedNoScope && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-p2)]">{t('settings.mlcal.connectedNoScope')}</p>
          <div className="flex gap-2">
            <a
              href={api.mindlogIdUrl()}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
            >
              {t('settings.mlcal.reconnect')}
            </a>
            <button
              type="button"
              onClick={disconnect}
              className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-[var(--color-p1)] hover:text-[var(--color-p1)]"
            >
              {t('settings.mlcal.disconnect')}
            </button>
          </div>
        </div>
      )}

      {status && !status.connected && (
        <div className="space-y-3">
          <p className="text-sm text-muted">{t('settings.mlcal.notConnected')}</p>
          <a
            href={api.mindlogIdUrl()}
            className="inline-block rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
          >
            {t('settings.mlcal.connect')}
          </a>
        </div>
      )}
    </Card>
  );
}

type CategoryId = 'account' | 'appearance' | 'ai' | 'connections' | 'data';

const CATEGORIES: { id: CategoryId; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'account', labelKey: 'settings.cat.account', icon: <UserIcon /> },
  { id: 'appearance', labelKey: 'settings.cat.appearance', icon: <PaletteIcon /> },
  { id: 'ai', labelKey: 'settings.cat.ai', icon: <SparklesIcon /> },
  { id: 'connections', labelKey: 'settings.cat.connections', icon: <PlugIcon /> },
  { id: 'data', labelKey: 'settings.cat.data', icon: <DownloadIcon /> },
];

export function SettingsPage() {
  const { t } = useI18n();
  const [active, setActive] = useState<CategoryId>('account');

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-xl font-bold text-ink">{t('nav.settings')}</h1>

      <div className="md:grid md:grid-cols-[200px_1fr] md:gap-8">
        {/* Category navigation: vertical sidebar on desktop, scrollable pills on mobile */}
        <nav aria-label={t('nav.settings')} className="mb-6 md:mb-0">
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:sticky md:top-8 md:flex-col md:overflow-visible md:px-0 md:pb-0">
            {CATEGORIES.map((c) => {
              const selected = active === c.id;
              return (
                <li key={c.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setActive(c.id)}
                    aria-current={selected ? 'page' : undefined}
                    className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-brand-soft text-brand'
                        : 'text-muted hover:bg-sidebar hover:text-ink'
                    }`}
                  >
                    {c.icon}
                    {t(c.labelKey)}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Active category panel */}
        <div className="min-w-0">
          {active === 'account' && <AccountCard />}
          {active === 'appearance' && <AppearanceCard />}
          {active === 'ai' && (
            <>
              <AiConfigCard />
              <AiActivityCard />
            </>
          )}
          {active === 'connections' && (
            <>
              <MindlogIdCalendarCard />
              <CalendarSourcesCard />
              <McpConnectorCard />
            </>
          )}
          {active === 'data' && <DataExportCard />}
        </div>
      </div>
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
    <Card title={t('settings.export')} icon={<DownloadIcon className="h-4 w-4" />}>
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
