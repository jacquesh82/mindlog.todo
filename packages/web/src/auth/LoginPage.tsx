import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import { useAuth } from './AuthContext';

type Mode = 'login' | 'register' | 'forgot';

export function LoginPage() {
  const { login, register } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else if (mode === 'register') await register(email, password, displayName || undefined);
      else {
        await api.forgotPassword(email);
        setInfo(t('login.resetSent'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === 'login'
      ? 'Sign in to your account'
      : mode === 'register'
        ? 'Create an account'
        : t('login.forgotTitle');

  return (
    <div className="auth-card">
      <h1>mindlog.todo</h1>
      <p className="muted">{title}</p>

      {mode === 'forgot' ? (
        <form onSubmit={submit}>
          <p className="muted" style={{ marginTop: 0 }}>{t('login.forgotHint')}</p>
          <input
            type="email"
            placeholder="Email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <div className="error">{error}</div>}
          {info && <div className="info">{info}</div>}
          <button type="submit" disabled={busy}>
            {t('login.sendReset')}
          </button>
          <p className="muted switch">
            <button type="button" className="link" onClick={() => switchMode('login')}>
              {t('login.backToLogin')}
            </button>
          </p>
        </form>
      ) : (
        <>
          <form onSubmit={submit}>
            {mode === 'register' && (
              <input
                placeholder="Display name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              required
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={busy}>
              {mode === 'login' ? 'Sign in' : 'Register'}
            </button>
          </form>

          {mode === 'login' && (
            <button type="button" className="link forgot-link" onClick={() => switchMode('forgot')}>
              {t('login.forgot')}
            </button>
          )}

          <a className="google-btn mindlogid-btn" href={api.mindlogIdUrl()}>
            <img
              src={`${import.meta.env.BASE_URL}milo.svg`}
              alt=""
              aria-hidden="true"
              className="provider-icon"
            />
            <span className="mindlogid-label">{t('login.mindlogIdBtn')}</span>
          </a>
          <a className="google-btn" href={api.googleUrl()}>
            Sign in with Google
          </a>

          <p className="muted switch">
            {mode === 'login' ? "No account?" : 'Have an account?'}{' '}
            <button
              type="button"
              className="link"
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Register' : 'Sign in'}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
