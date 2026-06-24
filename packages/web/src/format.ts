import type { Lang } from './i18n';

/** Local midnight for `d` (strips the time component). */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfToday(): Date {
  return startOfDay(new Date());
}

export function startOfTomorrow(): Date {
  const t = startOfToday();
  t.setDate(t.getDate() + 1);
  return t;
}

export interface DueLabel {
  text: string;
  tone: 'overdue' | 'today' | 'soon' | 'normal';
}

/** Render a due date the Todoist way: Today / Tomorrow / weekday / date. */
export function formatDue(
  iso: string,
  lang: Lang,
  t: (k: string) => string,
): DueLabel {
  const date = new Date(iso);
  const day = startOfDay(date);
  const today = startOfToday();
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) return { text: dateText(date, lang, true), tone: 'overdue' };
  if (diffDays === 0) return { text: t('date.today'), tone: 'today' };
  if (diffDays === 1) return { text: t('date.tomorrow'), tone: 'soon' };
  if (diffDays < 7) {
    return { text: capitalize(date.toLocaleDateString(lang, { weekday: 'long' })), tone: 'soon' };
  }
  return { text: dateText(date, lang, false), tone: 'normal' };
}

function hasTime(date: Date): boolean {
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}

function dateText(date: Date, lang: Lang, withYear: boolean): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (withYear && date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  let s = capitalize(date.toLocaleDateString(lang, opts));
  if (hasTime(date)) s += ` ${date.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}`;
  return s;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Priority (1–4) → CSS colour token name used for the check circle. */
export const PRIORITY_COLOR: Record<number, string> = {
  1: 'var(--color-p1)',
  2: 'var(--color-p2)',
  3: 'var(--color-p3)',
  4: 'var(--color-p4)',
};
