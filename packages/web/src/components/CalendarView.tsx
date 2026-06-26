import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PRIORITY_COLOR } from '../format';
import { useI18n, type Lang } from '../i18n';
import type { ExternalEvent, Label, Task } from '../types';

interface Props {
  tasks: Task[];
  labels: Map<string, Label>;
  onEdit: (task: Task) => void;
}

type CalMode = 'day' | 'week' | 'month';

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
};
/** Monday of the given date's week. */
function startOfWeek(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}
function monthGrid(year: number, month: number): Date[] {
  const start = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
function hasTime(t: Task): boolean {
  if (!t.dueDate) return false;
  const d = new Date(t.dueDate);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}
function timeLabel(t: Task, lang: Lang): string {
  return hasTime(t)
    ? new Date(t.dueDate!).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
    : '';
}

export function CalendarView({ tasks, labels, onEdit }: Props) {
  const { lang, t } = useI18n();
  const [mode, setMode] = useState<CalMode>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<ExternalEvent[]>([]);
  const todayKey = dayKey(new Date());

  // Subscribed-calendar events (best-effort; ignore failures).
  useEffect(() => {
    void api.calendarEvents().then(setEvents).catch(() => setEvents([]));
  }, []);
  const eventsByDay = new Map<string, ExternalEvent[]>();
  for (const e of events) {
    const k = dayKey(new Date(e.start));
    (eventsByDay.get(k) ?? eventsByDay.set(k, []).get(k)!).push(e);
  }

  const byDay = new Map<string, Task[]>();
  let unscheduled = 0;
  for (const task of tasks) {
    if (!task.dueDate) {
      unscheduled++;
      continue;
    }
    const k = dayKey(new Date(task.dueDate));
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(task);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  }

  const shift = (delta: number) => {
    if (mode === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    else setCursor(addDays(cursor, delta * (mode === 'week' ? 7 : 1)));
  };

  const headerLabel = () => {
    if (mode === 'month') return cap(cursor.toLocaleDateString(lang, { month: 'long', year: 'numeric' }));
    if (mode === 'day') return cap(cursor.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    const s = startOfWeek(cursor);
    const e = addDays(s, 6);
    return `${s.toLocaleDateString(lang, { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  function Chip({ task, withTime }: { task: Task; withTime?: boolean }) {
    return (
      <button
        onClick={() => onEdit(task)}
        title={task.title}
        className="flex w-full items-center gap-1 truncate rounded px-1 text-left text-xs text-ink hover:bg-line/60"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[task.priority] }} />
        {withTime && timeLabel(task, lang) && <span className="shrink-0 text-muted">{timeLabel(task, lang)}</span>}
        <span className={`truncate ${task.status === 'done' ? 'text-muted line-through' : ''}`}>{task.title}</span>
      </button>
    );
  }

  function EventChip({ ev }: { ev: ExternalEvent }) {
    const c = ev.color ?? '#808080';
    return (
      <div
        title={`${ev.sourceName}: ${ev.summary}`}
        className="flex w-full items-center gap-1 truncate rounded px-1 text-xs"
        style={{ color: c, backgroundColor: `${c}1a` }}
      >
        <span aria-hidden>📅</span>
        <span className="truncate">{ev.summary}</span>
      </div>
    );
  }

  const dayEvents = (k: string) => eventsByDay.get(k) ?? [];
  const weekDays = (anchor: Date) => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => shift(-1)} className="rounded-md border border-line px-2 py-1 text-sm text-ink hover:bg-line/60">‹</button>
        <span className="min-w-48 text-center text-sm font-semibold text-ink">{headerLabel()}</span>
        <button onClick={() => shift(1)} className="rounded-md border border-line px-2 py-1 text-sm text-ink hover:bg-line/60">›</button>
        <button onClick={() => setCursor(new Date())} className="rounded-md border border-line px-2 py-1 text-sm text-muted hover:bg-line/60">{t('date.today')}</button>
        <div className="ml-auto flex items-center gap-1">
          {(['day', 'week', 'month'] as CalMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded-md border px-2 py-1 text-sm ${mode === m ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted'}`}>
              {t(`cal.${m}`)}
            </button>
          ))}
        </div>
        {unscheduled > 0 && <span className="text-xs text-muted">{unscheduled} {t('calendar.unscheduled')}</span>}
      </div>

      {mode === 'month' && (
        <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-line">
          {weekDays(new Date(cursor.getFullYear(), cursor.getMonth(), 1)).map((d) => (
            <div key={dayKey(d)} className="border-b border-line bg-sidebar px-2 py-1 text-center text-xs font-semibold uppercase text-muted">
              {d.toLocaleDateString(lang, { weekday: 'short' })}
            </div>
          ))}
          {monthGrid(cursor.getFullYear(), cursor.getMonth()).map((d) => {
            const k = dayKey(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const list = byDay.get(k) ?? [];
            return (
              <div key={k} className={`min-h-24 border-b border-r border-line p-1 ${inMonth ? '' : 'bg-sidebar/50'}`}>
                <div className={`mb-1 text-right text-xs ${k === todayKey ? 'font-bold text-brand' : inMonth ? 'text-ink' : 'text-muted'}`}>{d.getDate()}</div>
                <div className="space-y-0.5">
                  {list.slice(0, 3).map((task) => <Chip key={task.id} task={task} />)}
                  {dayEvents(k).slice(0, 2).map((ev) => <EventChip key={ev.uid} ev={ev} />)}
                  {list.length > 3 && <div className="px-1 text-xs text-muted">+{list.length - 3}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'week' && (
        <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-line">
          {weekDays(cursor).map((d) => {
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            return (
              <div key={k} className="min-h-[28rem] border-r border-line">
                <div className={`border-b border-line px-2 py-1 text-center text-xs ${k === todayKey ? 'font-bold text-brand' : 'text-muted'}`}>
                  {cap(d.toLocaleDateString(lang, { weekday: 'short' }))} {d.getDate()}
                </div>
                <div className="space-y-1 p-1">
                  {list.map((task) => <Chip key={task.id} task={task} withTime />)}
                  {dayEvents(k).map((ev) => <EventChip key={ev.uid} ev={ev} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'day' && (
        <div className="overflow-hidden rounded-lg border border-line">
          <ul className="divide-y divide-line">
            {(byDay.get(dayKey(cursor)) ?? []).map((task) => (
              <li key={task.id} className="px-3 py-2">
                <Chip task={task} withTime />
              </li>
            ))}
            {dayEvents(dayKey(cursor)).map((ev) => (
              <li key={ev.uid} className="px-3 py-2">
                <EventChip ev={ev} />
              </li>
            ))}
            {(byDay.get(dayKey(cursor)) ?? []).length === 0 && dayEvents(dayKey(cursor)).length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted">{t('task.empty')}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
