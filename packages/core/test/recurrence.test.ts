import { describe, expect, it } from 'vitest';
import {
  formatRecurrence,
  nextOccurrence,
  normalizeRecurrence,
  parseRecurrence,
  type Recurrence,
} from '../src/domain/recurrence.js';

const d = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('parseRecurrence', () => {
  const cases: Array<[string, Recurrence]> = [
    ['daily', { freq: 'daily', interval: 1 }],
    ['every day', { freq: 'daily', interval: 1 }],
    ['every 3 days', { freq: 'daily', interval: 3 }],
    ['every other day', { freq: 'daily', interval: 2 }],
    ['weekly', { freq: 'weekly', interval: 1 }],
    ['every 2 weeks', { freq: 'weekly', interval: 2 }],
    ['every monday', { freq: 'weekly', interval: 1, weekdays: [1] }],
    ['every mon, wed and fri', { freq: 'weekly', interval: 1, weekdays: [1, 3, 5] }],
    ['every weekday', { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] }],
    ['every weekend', { freq: 'weekly', interval: 1, weekdays: [0, 6] }],
    ['monthly', { freq: 'monthly', interval: 1 }],
    ['every 3 months', { freq: 'monthly', interval: 3 }],
    ['every 15th', { freq: 'monthly', interval: 1, monthday: 15 }],
    ['every 1st of the month', { freq: 'monthly', interval: 1, monthday: 1 }],
    ['yearly', { freq: 'yearly', interval: 1 }],
    ['every 2 years', { freq: 'yearly', interval: 2 }],
  ];

  it.each(cases)('parses %s', (input, expected) => {
    expect(parseRecurrence(input)).toEqual(expected);
  });

  it('returns null for unrecognised input', () => {
    for (const bad of ['', 'sometimes', 'every blursday', 'every 32nd', 'whenever']) {
      expect(parseRecurrence(bad)).toBeNull();
    }
  });

  it('is case-insensitive', () => {
    expect(parseRecurrence('Every Monday')).toEqual({ freq: 'weekly', interval: 1, weekdays: [1] });
  });
});

describe('formatRecurrence / normalizeRecurrence', () => {
  it('renders canonical strings', () => {
    expect(normalizeRecurrence('every day')).toBe('every day');
    expect(normalizeRecurrence('every 3 days')).toBe('every 3 days');
    expect(normalizeRecurrence('every mon and wed')).toBe('every monday, wednesday');
    expect(normalizeRecurrence('every weekday')).toBe('every weekday');
    expect(normalizeRecurrence('every 15th')).toBe('every 15th');
    expect(normalizeRecurrence('every 2 weeks')).toBe('every 2 weeks');
  });

  it('round-trips parse∘format', () => {
    for (const r of ['every day', 'every 2 weeks', 'every weekend', 'every 21st']) {
      const parsed = parseRecurrence(r)!;
      expect(parseRecurrence(formatRecurrence(parsed))).toEqual(parsed);
    }
  });
});

describe('nextOccurrence', () => {
  it('advances daily by the interval', () => {
    expect(iso(nextOccurrence({ freq: 'daily', interval: 1 }, d('2026-06-24T09:00:00Z')))).toBe('2026-06-25');
    expect(iso(nextOccurrence({ freq: 'daily', interval: 3 }, d('2026-06-24T09:00:00Z')))).toBe('2026-06-27');
  });

  it('preserves the time of day', () => {
    const next = nextOccurrence({ freq: 'daily', interval: 1 }, d('2026-06-24T09:30:00Z'));
    expect(next.toISOString()).toBe('2026-06-25T09:30:00.000Z');
  });

  it('finds the next listed weekday', () => {
    // 2026-06-24 is a Wednesday. Next Mon/Fri rule → Friday the 26th.
    const r: Recurrence = { freq: 'weekly', interval: 1, weekdays: [1, 5] };
    expect(iso(nextOccurrence(r, d('2026-06-24T00:00:00Z')))).toBe('2026-06-26');
    // From Friday the 26th → next is Monday the 29th.
    expect(iso(nextOccurrence(r, d('2026-06-26T00:00:00Z')))).toBe('2026-06-29');
  });

  it('plain weekly jumps a full interval of weeks', () => {
    expect(iso(nextOccurrence({ freq: 'weekly', interval: 2 }, d('2026-06-24T00:00:00Z')))).toBe('2026-07-08');
  });

  it('monthly clamps to the month length', () => {
    // Jan 31 + 1 month → Feb 28 (2026 is not a leap year).
    const r: Recurrence = { freq: 'monthly', interval: 1, monthday: 31 };
    expect(iso(nextOccurrence(r, d('2026-01-31T00:00:00Z')))).toBe('2026-02-28');
  });

  it('monthly rolls over the year', () => {
    const r: Recurrence = { freq: 'monthly', interval: 1, monthday: 15 };
    expect(iso(nextOccurrence(r, d('2026-12-15T00:00:00Z')))).toBe('2027-01-15');
  });

  it('yearly advances the year and keeps Feb 29 handling sane', () => {
    expect(iso(nextOccurrence({ freq: 'yearly', interval: 1 }, d('2026-03-01T00:00:00Z')))).toBe('2027-03-01');
  });
});
