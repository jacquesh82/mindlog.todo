import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// Minimal toast system: a provider holding a queue and a `toast()` helper.
// Toasts auto-dismiss (default 3s) and stack at the bottom-right. They can carry
// an optional action button (e.g. "Undo") and a custom duration.

interface ToastAction {
  label: string;
  onAction: () => void | Promise<void>;
}

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
  action?: ToastAction;
}

interface ToastOptions {
  tone?: 'success' | 'error';
  action?: ToastAction;
  duration?: number;
}

interface ToastValue {
  // Backward-compatible: the 2nd arg may be a tone string (legacy) or an options object.
  toast: (message: string, opts?: 'success' | 'error' | ToastOptions) => void;
}

const ToastContext = createContext<ToastValue | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback<ToastValue['toast']>((message, opts) => {
    const o: ToastOptions = typeof opts === 'string' ? { tone: opts } : opts ?? {};
    const tone = o.tone ?? 'success';
    const duration = o.duration ?? 3000;
    const id = nextId++;
    setToasts((cur) => [...cur, { id, message, tone, action: o.action }]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), duration);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex flex-col gap-2" aria-live="polite">
        {toasts.map((x) => (
          <div
            key={x.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-2 text-sm shadow-lg ${
              x.tone === 'error'
                ? 'border-[var(--color-p1)] bg-surface text-[var(--color-p1)]'
                : 'border-line bg-surface text-ink'
            }`}
          >
            <span>
              {x.tone === 'success' ? '✓ ' : '⚠ '}
              {x.message}
            </span>
            {x.action && (
              <button
                onClick={() => {
                  void x.action!.onAction();
                  dismiss(x.id);
                }}
                className="shrink-0 rounded px-2 py-0.5 text-sm font-semibold text-brand hover:bg-line/60"
              >
                {x.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
