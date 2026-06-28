import { useEffect } from 'react';
import { API, getAccessToken, refreshAccessToken } from './client';

// Real-time change stream over Server-Sent Events. Native EventSource cannot send
// an Authorization header, so we read the stream with fetch + a ReadableStream
// reader instead, carrying the in-memory Bearer token and refreshing it on 401.
// A single connection (started by App) broadcasts to all registered listeners.

export interface ServerChange {
  entity: 'task' | 'project' | 'section' | 'label' | 'filter';
  action: 'create' | 'update' | 'delete';
  id?: string;
}

type Listener = (event: ServerChange) => void;
const listeners = new Set<Listener>();

function broadcast(event: ServerChange): void {
  for (const fn of listeners) fn(event);
}

/** Register a listener for server-pushed changes. Returns an unsubscribe fn. */
export function onServerChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Open the SSE connection and keep it alive (reconnecting with backoff). */
export function connectServerEvents(): () => void {
  let closed = false;
  let retry = 1000;
  let controller: AbortController | null = null;

  function schedule(): void {
    if (closed) return;
    const delay = retry;
    retry = Math.min(retry * 2, 30_000);
    setTimeout(() => void connect(), delay);
  }

  async function connect(): Promise<void> {
    if (closed) return;
    const token = getAccessToken();
    if (!token) {
      schedule(); // not signed in yet — try again shortly
      return;
    }
    controller = new AbortController();
    try {
      const res = await fetch(`${API}/api/v1/events`, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (res.status === 401) {
        if (await refreshAccessToken()) return void connect();
        schedule();
        return;
      }
      if (!res.ok || !res.body) {
        schedule();
        return;
      }
      retry = 1000; // healthy connection → reset backoff

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          const json = dataLine.slice(5).trim();
          if (!json) continue;
          try {
            broadcast(JSON.parse(json) as ServerChange);
          } catch {
            /* ignore malformed frame */
          }
        }
      }
      if (!closed) schedule(); // stream ended → reconnect
    } catch {
      if (!closed) schedule(); // network error → reconnect
    }
  }

  void connect();

  return () => {
    closed = true;
    controller?.abort();
  };
}

/**
 * Run `onChange` whenever the server reports a data change, debounced so a burst
 * of events (e.g. a bulk edit) coalesces into a single reload.
 */
export function useServerEvents(onChange: () => void): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onServerChange(() => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 300);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [onChange]);
}
