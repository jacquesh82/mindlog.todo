import {
  parseIcs,
  type CalendarEvent,
  type CalendarSource,
  type CalendarSourceCreateInput,
  type CalendarSourceUpdateInput,
} from '../domain/calendar.js';
import { NotFound } from '../errors.js';
import * as repo from '../repository/calendar-source.repo.js';

export function createSource(userId: string, input: CalendarSourceCreateInput): Promise<CalendarSource> {
  return repo.insert(userId, input.name, input.url, input.color ?? null);
}

export function listSources(userId: string): Promise<CalendarSource[]> {
  return repo.list(userId);
}

export async function updateSource(
  userId: string,
  id: string,
  patch: CalendarSourceUpdateInput,
): Promise<CalendarSource> {
  const updated = await repo.update(userId, id, patch);
  if (!updated) throw NotFound('Calendar source not found');
  return updated;
}

export async function deleteSource(userId: string, id: string): Promise<void> {
  if (!(await repo.remove(userId, id))) throw NotFound('Calendar source not found');
}

/** An event tagged with the source it came from (for colour + grouping). */
export interface ExternalEvent extends CalendarEvent {
  sourceId: string;
  sourceName: string;
  color: string | null;
}

// Per-URL cache so loading the calendar repeatedly doesn't re-fetch every feed.
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { events: CalendarEvent[]; at: number }>();

async function fetchIcs(url: string, nowMs: number): Promise<CalendarEvent[]> {
  const cached = cache.get(url);
  if (cached && nowMs - cached.at < TTL_MS) return cached.events;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const events = parseIcs(text);
    cache.set(url, { events, at: nowMs });
    return events;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch and merge events from all of a user's calendar feeds, optionally within
 * [from, to]. A failing feed is skipped (logged), not fatal.
 */
export async function getEvents(userId: string, from?: Date, to?: Date): Promise<ExternalEvent[]> {
  const sources = await repo.list(userId);
  const nowMs = Date.now();
  const out: ExternalEvent[] = [];
  await Promise.all(
    sources.map(async (s) => {
      try {
        const events = await fetchIcs(s.url, nowMs);
        await repo.touchSynced(s.id);
        for (const e of events) {
          const start = new Date(e.start);
          if (from && start < from) continue;
          if (to && start > to) continue;
          out.push({ ...e, sourceId: s.id, sourceName: s.name, color: s.color });
        }
      } catch (err) {
        console.error(`[calendar] feed "${s.name}" failed:`, err instanceof Error ? err.message : err);
      }
    }),
  );
  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}
