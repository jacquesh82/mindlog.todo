import type { ReactNode } from 'react';

// Lightweight inline SVG illustrations. They draw neutral strokes with
// `currentColor` (so the wrapper's text color themes them) and pull the accent
// from the brand tokens, keeping them crisp in both light and dark mode.

const stroke = { stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

/** Empty task list — a clipboard with a check badge. */
export function EmptyTasksArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 180" className={className} fill="none" aria-hidden="true">
      <rect x="55" y="32" width="110" height="128" rx="12" {...stroke} opacity="0.6" />
      <rect x="92" y="22" width="36" height="20" rx="6" {...stroke} fill="var(--color-surface)" />
      <line x1="75" y1="72" x2="145" y2="72" {...stroke} opacity="0.4" />
      <line x1="75" y1="96" x2="145" y2="96" {...stroke} opacity="0.4" />
      <line x1="75" y1="120" x2="118" y2="120" {...stroke} opacity="0.4" />
      <circle cx="150" cy="126" r="26" fill="var(--color-brand-soft)" stroke="var(--color-brand)" strokeWidth="3" />
      <path d="M139 126 l8 8 l16 -18" stroke="var(--color-brand)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** All done / completed — a check inside a celebratory burst. */
export function CelebrationArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 180" className={className} fill="none" aria-hidden="true">
      <circle cx="110" cy="92" r="46" fill="var(--color-brand-soft)" stroke="var(--color-brand)" strokeWidth="3" />
      <path d="M88 92 l14 15 l30 -34" stroke="var(--color-brand)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M48 60 v16 M40 68 h16" {...stroke} opacity="0.45" />
      <path d="M172 48 v12 M166 54 h12" {...stroke} opacity="0.45" />
      <circle cx="58" cy="128" r="3.5" fill="var(--color-brand)" />
      <circle cx="166" cy="118" r="3.5" fill="currentColor" opacity="0.45" />
      <circle cx="150" cy="150" r="2.5" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

/** No search results — a magnifier over a dashed ring. */
export function SearchEmptyArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 180" className={className} fill="none" aria-hidden="true">
      <circle cx="96" cy="82" r="42" stroke="currentColor" strokeWidth="3" strokeDasharray="6 9" opacity="0.45" />
      <path d="M82 82 a14 14 0 0 1 14 -14" stroke="var(--color-brand)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <line x1="127" y1="113" x2="162" y2="148" stroke="var(--color-brand)" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

/** Generic empty-state block: illustration + message + optional hint/action. */
export function EmptyState({
  art,
  title,
  subtitle,
  action,
}: {
  art: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <div className="mb-4 h-28 w-40 text-muted">{art}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {subtitle && <p className="mt-1 max-w-xs text-xs text-muted">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
