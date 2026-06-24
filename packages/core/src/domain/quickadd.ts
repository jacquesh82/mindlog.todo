import * as chrono from 'chrono-node';
import { normalizeRecurrence } from './recurrence.js';

// Natural-language "Quick Add": turn a single line like
//   "Submit report tomorrow at 5pm #Work @urgent p1 every week"
// into structured fields. Project/label names are returned as-is; the service
// resolves them to ids. Token syntax mirrors Todoist: #project, @label, p1–p4.

export interface QuickAddParse {
  title: string;
  projectName: string | null;
  labelNames: string[];
  priority: number | null;
  dueDate: Date | null;
  /** Canonical recurrence string (e.g. "every week"), or null. */
  recurrence: string | null;
}

const PRIORITY_RE = /(?:^|\s)(p[1-4])(?=\s|$)/i;
const PROJECT_RE = /(?:^|\s)#([\p{L}\p{N}_-]+)/u;
const LABEL_RE = /(?:^|\s)@([\p{L}\p{N}_-]+)/gu;

/** Pull the recurrence phrase ("every …") out of the text, if any. */
function extractRecurrence(text: string): { recurrence: string | null; rest: string } {
  const m = text.match(/\bevery\b.*$/i);
  if (!m || m.index === undefined) return { recurrence: null, rest: text };
  const words = m[0].split(/\s+/);
  // Greedily shrink the trailing phrase until it parses as a valid rule.
  for (let end = words.length; end >= 2; end--) {
    const phrase = words.slice(0, end).join(' ');
    const canonical = normalizeRecurrence(phrase);
    if (canonical) {
      const rest = (text.slice(0, m.index) + text.slice(m.index + phrase.length)).trim();
      return { recurrence: canonical, rest };
    }
  }
  return { recurrence: null, rest: text };
}

export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddParse {
  let text = input.trim();
  let priority: number | null = null;
  let projectName: string | null = null;
  const labelNames: string[] = [];

  // Priority (last p1–p4 wins).
  const pm = text.match(PRIORITY_RE);
  if (pm) {
    priority = parseInt(pm[1]!.slice(1), 10);
    text = text.replace(PRIORITY_RE, ' ').trim();
  }

  // Project (#name) — first one only.
  const projM = text.match(PROJECT_RE);
  if (projM) {
    projectName = projM[1]!;
    text = text.replace(PROJECT_RE, ' ').trim();
  }

  // Labels (@name) — all of them.
  for (const m of text.matchAll(LABEL_RE)) {
    if (!labelNames.includes(m[1]!)) labelNames.push(m[1]!);
  }
  text = text.replace(LABEL_RE, ' ').trim();

  // Recurrence before date parsing (chrono shouldn't see "every week").
  const { recurrence, rest } = extractRecurrence(text);
  text = rest;

  // Date / time via chrono (forwardDate keeps "friday"/"vendredi" in the
  // future). Parse with BOTH English and French and keep the single match that
  // covers the most text — otherwise English grabs a partial match (e.g. just
  // "17h") and leaves the rest of a French date phrase in the title.
  let dueDate: Date | null = null;
  const opts = { forwardDate: true } as const;
  const candidates = [...chrono.parse(text, now, opts), ...chrono.fr.parse(text, now, opts)];
  let best: (typeof candidates)[number] | null = null;
  for (const r of candidates) {
    if (!best || r.text.length > best.text.length) best = r;
  }
  if (best) {
    dueDate = best.start.date();
    text = (text.slice(0, best.index) + text.slice(best.index + best.text.length)).trim();
  }

  // Strip a dangling connector left at the title edge by date removal
  // (e.g. "réunion le" / "call about at").
  const CONNECTORS = /(?:^|\s)(?:à|le|la|les|du|de|the|at|on|by|for)\s*$/i;
  const title = text.replace(/\s{2,}/g, ' ').replace(CONNECTORS, '').trim();
  return { title, projectName, labelNames, priority, dueDate, recurrence };
}
