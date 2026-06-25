import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useI18n } from './i18n';

// In-app replacements for window.confirm / window.prompt: an imperative dialog
// API (`await dialog.confirm(...)`, `await dialog.promptText(...)`) backed by an
// accessible modal (focus trap-ish, Escape cancels, Enter submits).

interface ConfirmReq {
  kind: 'confirm';
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}
interface PromptReq {
  kind: 'prompt';
  title: string;
  placeholder?: string;
  defaultValue?: string;
  resolve: (value: string | null) => void;
}
type Req = ConfirmReq | PromptReq;

interface DialogValue {
  confirm: (opts: Omit<ConfirmReq, 'kind' | 'resolve'>) => Promise<boolean>;
  promptText: (opts: Omit<PromptReq, 'kind' | 'resolve'>) => Promise<string | null>;
}

const DialogContext = createContext<DialogValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [req, setReq] = useState<Req | null>(null);
  const [value, setValue] = useState('');

  const confirm = useCallback<DialogValue['confirm']>(
    (opts) => new Promise((resolve) => setReq({ kind: 'confirm', ...opts, resolve })),
    [],
  );
  const promptText = useCallback<DialogValue['promptText']>(
    (opts) =>
      new Promise((resolve) => {
        setValue(opts.defaultValue ?? '');
        setReq({ kind: 'prompt', ...opts, resolve });
      }),
    [],
  );

  function close(result: boolean | string | null) {
    if (!req) return;
    if (req.kind === 'confirm') req.resolve(result as boolean);
    else req.resolve(result as string | null);
    setReq(null);
  }

  return (
    <DialogContext.Provider value={{ confirm, promptText }}>
      {children}
      {req && (
        <div
          className="fixed inset-0 z-[1100] flex items-start justify-center bg-black/40 p-4 pt-32"
          onClick={() => close(req.kind === 'confirm' ? false : null)}
          onKeyDown={(e) => e.key === 'Escape' && close(req.kind === 'confirm' ? false : null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-ink">{req.title}</h2>
            {req.kind === 'confirm' && req.message && <p className="mt-2 text-sm text-muted">{req.message}</p>}
            {req.kind === 'prompt' && (
              <input
                autoFocus
                value={value}
                placeholder={req.placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && value.trim() && close(value.trim())}
                className="mt-3 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => close(req.kind === 'confirm' ? false : null)}
                className="rounded-md px-3 py-1.5 text-sm text-ink hover:bg-line/60"
              >
                {t('task.cancel')}
              </button>
              <button
                autoFocus={req.kind === 'confirm'}
                onClick={() => close(req.kind === 'confirm' ? true : value.trim() || null)}
                disabled={req.kind === 'prompt' && !value.trim()}
                className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                  req.kind === 'confirm' && req.danger
                    ? 'bg-[var(--color-p1)] hover:opacity-90'
                    : 'bg-brand hover:bg-brand-hover'
                }`}
              >
                {req.kind === 'confirm' ? req.confirmLabel ?? t('dialog.ok') : t('dialog.ok')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
