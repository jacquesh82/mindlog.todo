import {
  fetchMindlogIdAgenda,
  hasAgendaScope,
  MindlogIdAuthError,
  MindlogIdScopeError,
  refreshMindlogIdToken,
  type MindlogIdEvent,
} from '../auth/mindlog-id.js';
import {
  parseIcs,
  type CalendarEvent,
  type CalendarSource,
  type CalendarSourceCreateInput,
  type CalendarSourceUpdateInput,
} from '../domain/calendar.js';
import { NotFound } from '../errors.js';
import * as repo from '../repository/calendar-source.repo.js';
import * as userRepo from '../repository/user.repo.js';

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
  const inRange = (iso: string) => {
    const start = new Date(iso);
    if (from && start < from) return false;
    if (to && start > to) return false;
    return true;
  };

  await Promise.all([
    ...sources.map(async (s) => {
      try {
        const events = await fetchIcs(s.url, nowMs);
        await repo.touchSynced(s.id);
        for (const e of events) {
          if (!inRange(e.start)) continue;
          out.push({ ...e, sourceId: s.id, sourceName: s.name, color: s.color });
        }
      } catch (err) {
        console.error(`[calendar] feed "${s.name}" failed:`, err instanceof Error ? err.message : err);
      }
    }),
    (async () => {
      try {
        for (const e of await fetchMindlogIdEvents(userId)) {
          if (!inRange(e.start)) continue;
          out.push(e);
        }
      } catch (err) {
        console.error('[calendar] mindlog id agenda failed:', err instanceof Error ? err.message : err);
      }
    })(),
  ]);
  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

// --- mindlog id agenda (events from the central identity provider) ---

/** Source id/colour for events pulled from the user's mindlog id agenda. */
export const MINDLOG_ID_SOURCE_ID = 'mindlog-id';
const MINDLOG_ID_SOURCE_NAME = 'mindlog id';
const MINDLOG_ID_COLOR = '#8b5cf6'; // violet — distinct from iCal feed colours

function mapMindlogIdEvent(e: MindlogIdEvent): ExternalEvent {
  return {
    uid: `${MINDLOG_ID_SOURCE_ID}-${e.id}`,
    summary: e.title,
    start: new Date(e.starts_at).toISOString(),
    end: e.ends_at ? new Date(e.ends_at).toISOString() : null,
    allDay: false,
    sourceId: MINDLOG_ID_SOURCE_ID,
    sourceName: MINDLOG_ID_SOURCE_NAME,
    color: MINDLOG_ID_COLOR,
  };
}

/**
 * Read the user's mindlog id agenda, refreshing the access token when expired.
 * Returns [] when there's no connection or the agenda scope wasn't granted.
 */
export async function fetchMindlogIdEvents(userId: string): Promise<ExternalEvent[]> {
  const conn = await userRepo.getMindlogIdConnection(userId);
  if (!conn || !hasAgendaScope(conn.scope)) return [];

  let accessToken = conn.accessToken;
  // Proactively refresh if the token is expired (or within 30s of it).
  if (conn.expiresAt.getTime() - Date.now() < 30_000) {
    accessToken = await refreshConnection(userId, conn.refreshToken, conn.scope);
  }

  try {
    return (await fetchMindlogIdAgenda(accessToken)).map(mapMindlogIdEvent);
  } catch (err) {
    if (err instanceof MindlogIdScopeError) return [];
    if (err instanceof MindlogIdAuthError) {
      // Stale access token despite our expiry check — refresh once and retry.
      const fresh = await refreshConnection(userId, conn.refreshToken, conn.scope);
      return (await fetchMindlogIdAgenda(fresh)).map(mapMindlogIdEvent);
    }
    throw err;
  }
}

/** Rotate the mindlog id tokens, persist them, and return the new access token. */
async function refreshConnection(
  userId: string,
  refreshToken: string,
  prevScope: string,
): Promise<string> {
  const t = await refreshMindlogIdToken(refreshToken);
  await userRepo.upsertMindlogIdConnection(userId, {
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiresAt: new Date(Date.now() + t.expiresIn * 1000),
    // The refresh response may omit scope; keep the originally granted one then.
    scope: t.scope || prevScope,
  });
  return t.accessToken;
}
