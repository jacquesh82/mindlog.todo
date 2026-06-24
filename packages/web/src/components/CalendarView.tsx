import { useState } from 'react';
import { PRIORITY_COLOR } from '../format';
import { useI18n } from '../i18n';
import type { Label, Task } from '../types';

interface Props {
  tasks: Task[];
  labels: Map<string, Label>;
  onEdit: (task: Task) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Monday-first 6×7 grid of dates covering the given month. */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  // Back up to Monday (getDay: 0=Sun..6=Sat → Monday offset).
  const offset = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function CalendarView({ tasks, labels, onEdit }: Props) {
  const { lang, t } = useI18n();
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const todayKey = dayKey(new Date());

  // Bucket scheduled tasks by their due day.
  const byDay = new Map<string, Task[]>();
  let unscheduled = 0;
  for (const task of tasks) {
    if (!task.dueDate) {
      unscheduled++;
      continue;
    }
    const k = dayKey(new Date(task.dueDate));
    const list = byDay.get(k);
    if (list) list.push(task);
    else byDay.set(k, [task]);
  }

  const days = monthGrid(year, month);
  // Derive the weekday headers from the first row so they always line up.
  const weekdays = days.slice(0, 7).map((d) => d.toLocaleDateString(lang, { weekday: 'short' }));
  const monthLabel = cursor.toLocaleDateString(lang, { month: 'long', year: 'numeric' });

  const shift = (delta: number) => setCursor(new Date(year, month + delta, 1));

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => shift(-1)} className="rounded-md border border-line px-2 py-1 text-sm text-ink hover:bg-line/60">‹</button>
        <span className="min-w-44 text-center text-sm font-semibold capitalize text-ink">{monthLabel}</span>
        <button onClick={() => shift(1)} className="rounded-md border border-line px-2 py-1 text-sm text-ink hover:bg-line/60">›</button>
        <button onClick={() => setCursor(new Date())} className="rounded-md border border-line px-2 py-1 text-sm text-muted hover:bg-line/60">
          {t('date.today')}
        </button>
        {unscheduled > 0 && <span className="ml-auto text-xs text-muted">{unscheduled} {t('calendar.unscheduled')}</span>}
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-line">
        {weekdays.map((w) => (
          <div key={w} className="border-b border-line bg-sidebar px-2 py-1 text-center text-xs font-semibold uppercase text-muted">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === month;
          const dayTasks = byDay.get(k) ?? [];
          return (
            <div key={k} className={`min-h-24 border-b border-r border-line p-1 ${inMonth ? '' : 'bg-sidebar/50'}`}>
              <div className={`mb-1 text-right text-xs ${k === todayKey ? 'font-bold text-brand' : inMonth ? 'text-ink' : 'text-muted'}`}>
                {d.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 4).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onEdit(task)}
                    className="flex w-full items-center gap-1 truncate rounded px-1 text-left text-xs text-ink hover:bg-line/60"
                    title={task.title}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[task.priority] }} />
                    <span className={`truncate ${task.status === 'done' ? 'text-muted line-through' : ''}`}>{task.title}</span>
                    {task.labelIds.slice(0, 1).map((id) => {
                      const l = labels.get(id);
                      return l ? <span key={id} className="text-muted">@{l.name}</span> : null;
                    })}
                  </button>
                ))}
                {dayTasks.length > 4 && <div className="px-1 text-xs text-muted">+{dayTasks.length - 4}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
