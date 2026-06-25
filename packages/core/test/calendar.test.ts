import { describe, expect, it } from 'vitest';
import { parseIcs } from '../src/domain/calendar.js';

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:abc-1
SUMMARY:Sprint review
DTSTART:20260626T090000Z
DTEND:20260626T100000Z
END:VEVENT
BEGIN:VEVENT
UID:abc-2
SUMMARY:Day off
DTSTART;VALUE=DATE:20260701
DTEND;VALUE=DATE:20260702
END:VEVENT
BEGIN:VEVENT
UID:abc-3
SUMMARY:Long title that is folded across
  two physical lines
DTSTART;TZID=Europe/Paris:20260627T140000
END:VEVENT
END:VCALENDAR`;

describe('parseIcs', () => {
  const events = parseIcs(ICS);

  it('parses a UTC timed event', () => {
    const e = events.find((x) => x.uid === 'abc-1')!;
    expect(e.summary).toBe('Sprint review');
    expect(e.allDay).toBe(false);
    expect(e.start).toBe('2026-06-26T09:00:00.000Z');
    expect(e.end).toBe('2026-06-26T10:00:00.000Z');
  });

  it('parses an all-day event (VALUE=DATE)', () => {
    const e = events.find((x) => x.uid === 'abc-2')!;
    expect(e.allDay).toBe(true);
    expect(e.start).toBe('2026-07-01T00:00:00.000Z');
  });

  it('unfolds folded SUMMARY lines', () => {
    const e = events.find((x) => x.uid === 'abc-3')!;
    expect(e.summary).toBe('Long title that is folded across two physical lines');
    expect(e.allDay).toBe(false);
  });

  it('returns one entry per VEVENT', () => {
    expect(events).toHaveLength(3);
  });

  it('handles an empty / non-event document', () => {
    expect(parseIcs('BEGIN:VCALENDAR\nEND:VCALENDAR')).toEqual([]);
  });
});
