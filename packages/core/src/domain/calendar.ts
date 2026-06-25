import { z } from 'zod';

// A minimal iCalendar (RFC 5545) reader: enough to subscribe to an .ics feed
// over HTTP (a plain calendar file, or a Google Calendar "secret iCal" URL) and
// surface its events. Timezone handling is intentionally simple: UTC ("…Z") and
// all-day (VALUE=DATE) are exact; floating / TZID datetimes are read as-is.

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be #rrggbb');

export const calendarSourceCreateSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().max(2000),
  color: colorSchema.optional(),
});
export type CalendarSourceCreateInput = z.infer<typeof calendarSourceCreateSchema>;

export const calendarSourceUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  url: z.string().url().max(2000).optional(),
  color: colorSchema.nullable().optional(),
});
export type CalendarSourceUpdateInput = z.infer<typeof calendarSourceUpdateSchema>;

export interface CalendarSource {
  id: string;
  userId: string;
  name: string;
  url: string;
  color: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface CalendarEvent {
  uid: string;
  summary: string;
  /** ISO start; for all-day events the time is midnight. */
  start: string;
  end: string | null;
  allDay: boolean;
}

/** Unfold RFC 5545 folded lines (continuations begin with a space or tab). */
function unfold(text: string): string[] {
  const raw = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function toIso(value: string, dateOnly: boolean): { iso: string; allDay: boolean } {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return { iso: new Date(value).toISOString(), allDay: dateOnly };
  const [, y, mo, d, hh, mm, ss, z] = m;
  const Y = +y!, Mo = +mo! - 1, D = +d!;
  if (dateOnly || hh === undefined) {
    return { iso: new Date(Date.UTC(Y, Mo, D)).toISOString(), allDay: true };
  }
  const H = +hh!, Mi = +mm!, S = +ss!;
  const date = z ? new Date(Date.UTC(Y, Mo, D, H, Mi, S)) : new Date(Y, Mo, D, H, Mi, S);
  return { iso: date.toISOString(), allDay: false };
}

/** Parse an .ics document into a list of events. */
export function parseIcs(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let cur: Record<string, { value: string; params: string }> | null = null;

  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur) {
        const dt = cur.DTSTART;
        if (dt) {
          const dateOnly = /VALUE=DATE(?!-)/.test(dt.params);
          const start = toIso(dt.value, dateOnly);
          const endRaw = cur.DTEND;
          const end = endRaw ? toIso(endRaw.value, /VALUE=DATE(?!-)/.test(endRaw.params)) : null;
          events.push({
            uid: cur.UID?.value ?? `${start.iso}-${cur.SUMMARY?.value ?? ''}`,
            summary: (cur.SUMMARY?.value ?? '(no title)').replace(/\\,/g, ',').replace(/\\n/gi, ' '),
            start: start.iso,
            end: end?.iso ?? null,
            allDay: start.allDay,
          });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const semi = left.indexOf(';');
    const name = semi === -1 ? left : left.slice(0, semi);
    const params = semi === -1 ? '' : left.slice(semi + 1);
    cur[name] = { value, params };
  }
  return events;
}
