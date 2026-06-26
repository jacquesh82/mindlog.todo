import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// Minimal toast system: a provider holding a queue and a `toast()` helper.
// Toasts auto-dismiss after 3s and stack at the bottom-right.

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

interface ToastValue {
  toast: (message: string, tone?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastValue | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = nextId++;
    setToasts((cur) => [...cur, { id, message, tone }]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex flex-col gap-2" aria-live="polite">
        {toasts.map((x) => (
          <div
            key={x.id}
            className={`pointer-events-auto rounded-lg border px-4 py-2 text-sm shadow-lg ${
              x.tone === 'error'
                ? 'border-[var(--color-p1)] bg-surface text-[var(--color-p1)]'
                : 'border-line bg-surface text-ink'
            }`}
          >
            {x.tone === 'success' ? '✓ ' : '⚠ '}
            {x.message}
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
