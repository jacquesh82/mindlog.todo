import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';

/** Standalone page reached from the password-reset email (`/auth/reset?token=…`). */
export function ResetPasswordPage({ token }: { token: string }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('reset.mismatch'));
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>mindlog.todo</h1>
      <p className="muted">{t('reset.title')}</p>
      {done ? (
        <>
          <div className="info">{t('reset.success')}</div>
          <button type="button" onClick={() => window.location.assign(import.meta.env.BASE_URL)}>
            {t('reset.toLogin')}
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <input
            type="password"
            placeholder={t('reset.password')}
            value={password}
            required
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="password"
            placeholder={t('reset.confirm')}
            value={confirm}
            required
            minLength={8}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={busy}>
            {t('reset.submit')}
          </button>
        </form>
      )}
    </div>
  );
}
