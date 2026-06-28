export type Theme = 'light' | 'dark';

const KEY = 'mindlog_theme';

/** Stored preference, else the OS preference, else light. */
export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Apply a theme to the document and persist it. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(KEY, theme);
}

// --- Accent (brand) color ---

const ACCENT_KEY = 'mindlog_accent';

/** The default mindlog red, plus a curated palette for the picker. */
export const DEFAULT_ACCENT = '#db4c3f';
export const ACCENT_PRESETS = [
  '#db4c3f', // mindlog red
  '#e8833a', // orange
  '#eab308', // amber
  '#2fa36b', // green
  '#14b8a6', // teal
  '#4c7cf3', // blue
  '#8b5cf6', // purple
  '#db4c8f', // pink
];

/** Stored accent, or the default. */
export function getInitialAccent(): string {
  return localStorage.getItem(ACCENT_KEY) ?? DEFAULT_ACCENT;
}

/**
 * Apply an accent color by overriding the brand CSS variables. Hover/soft are
 * derived with color-mix so they adapt in both light and dark themes. Passing
 * the default clears the overrides (falls back to the stylesheet tokens).
 */
export function applyAccent(color: string): void {
  const root = document.documentElement;
  if (!color || color.toLowerCase() === DEFAULT_ACCENT) {
    root.style.removeProperty('--color-brand');
    root.style.removeProperty('--color-brand-hover');
    root.style.removeProperty('--color-brand-soft');
    localStorage.removeItem(ACCENT_KEY);
    return;
  }
  root.style.setProperty('--color-brand', color);
  root.style.setProperty('--color-brand-hover', `color-mix(in srgb, ${color} 85%, black)`);
  root.style.setProperty('--color-brand-soft', `color-mix(in srgb, ${color} 14%, transparent)`);
  localStorage.setItem(ACCENT_KEY, color);
}
