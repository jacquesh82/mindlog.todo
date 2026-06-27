import { useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import { useAuth } from './AuthContext';
import { LoginPage } from './LoginPage';

/**
 * OAuth consent screen for remote MCP clients (e.g. Claude). The server's
 * `/oauth/authorize` redirects the browser here with the request parameters. We
 * reuse the existing session (any login method); once the user approves, the
 * server mints an authorization code and we redirect back to the client.
 */
export function AuthorizePage() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState<null | 'allow' | 'deny'>(null);
  const [error, setError] = useState<string | null>(null);

  const q = new URLSearchParams(window.location.search);
  const params: Record<string, string> = {
    clientId: q.get('client_id') ?? '',
    redirectUri: q.get('redirect_uri') ?? '',
    responseType: q.get('response_type') ?? 'code',
    codeChallenge: q.get('code_challenge') ?? '',
    codeChallengeMethod: q.get('code_challenge_method') ?? 'S256',
    scope: q.get('scope') ?? '',
    state: q.get('state') ?? '',
    resource: q.get('resource') ?? '',
  };

  async function decide(approve: boolean): Promise<void> {
    setSubmitting(approve ? 'allow' : 'deny');
    setError(null);
    try {
      const { redirectTo } = await api.authorizeConsent(params, approve);
      window.location.href = redirectTo;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(null);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="legacy flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg)]">
      <div className="flex flex-col items-center gap-1.5">
        <img src={`${import.meta.env.BASE_URL}milo.svg`} alt="Milo" className="h-16 w-16" />
        <div className="text-lg font-semibold" style={{ color: 'var(--color-brand)' }}>
          {t('app.name')}
        </div>
      </div>
      <div className="login-shell">{children}</div>
    </div>
  );

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center text-muted">{t('common.loading')}</div>
    );

  // Not signed in: let the user authenticate first (any method), then the
  // consent screen renders on the next pass since `user` becomes set in place.
  if (!user)
    return shell(
      <div className="flex flex-col gap-4">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {t('authorize.loginPrompt')}
        </p>
        <LoginPage />
      </div>,
    );

  return shell(
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t('authorize.title')}</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {t('authorize.subtitle')}
        </p>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        <li className="flex items-center gap-2">
          <span style={{ color: 'var(--color-brand)' }}>✓</span>
          {t('authorize.scopeTasks')}
        </li>
        <li className="flex items-center gap-2">
          <span style={{ color: 'var(--color-brand)' }}>✓</span>
          {t('authorize.scopeNotes')}
        </li>
      </ul>
      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
        {t('authorize.account')} <strong>{user.email}</strong>
      </p>
      {error && (
        <p className="text-sm" style={{ color: 'var(--color-brand)' }}>
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void decide(false)}
          disabled={submitting !== null}
          className="flex-1 rounded-md border px-4 py-2 text-sm font-medium"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {t('authorize.deny')}
        </button>
        <button
          type="button"
          onClick={() => void decide(true)}
          disabled={submitting !== null}
          className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--color-brand)' }}
        >
          {submitting === 'allow' ? t('common.loading') : t('authorize.allow')}
        </button>
      </div>
    </div>,
  );
}
