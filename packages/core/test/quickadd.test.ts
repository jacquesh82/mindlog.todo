import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from '../src/domain/quickadd.js';

// A fixed reference point: Wednesday 24 June 2026, 09:00 local time.
const NOW = new Date(2026, 5, 24, 9, 0, 0);

describe('parseQuickAdd', () => {
  it('returns a bare title when there are no tokens', () => {
    const r = parseQuickAdd('Buy milk', NOW);
    expect(r.title).toBe('Buy milk');
    expect(r.projectName).toBeNull();
    expect(r.labelNames).toEqual([]);
    expect(r.priority).toBeNull();
    expect(r.dueDate).toBeNull();
    expect(r.recurrence).toBeNull();
  });

  it('extracts project, labels and priority', () => {
    const r = parseQuickAdd('Submit report #Work @urgent @client p1', NOW);
    expect(r.title).toBe('Submit report');
    expect(r.projectName).toBe('Work');
    expect(r.labelNames).toEqual(['urgent', 'client']);
    expect(r.priority).toBe(1);
  });

  it('extracts a recurrence phrase', () => {
    expect(parseQuickAdd('Standup every weekday', NOW).recurrence).toBe('every weekday');
    expect(parseQuickAdd('Pay rent every 1st', NOW).recurrence).toBe('every 1st');
    const r = parseQuickAdd('Water plants every 3 days', NOW);
    expect(r.recurrence).toBe('every 3 days');
    expect(r.title).toBe('Water plants');
  });

  it('parses a relative date and strips it from the title', () => {
    const r = parseQuickAdd('Call dentist tomorrow', NOW);
    expect(r.title).toBe('Call dentist');
    expect(r.dueDate).not.toBeNull();
    expect(r.dueDate!.getFullYear()).toBe(2026);
    expect(r.dueDate!.getMonth()).toBe(5);
    expect(r.dueDate!.getDate()).toBe(25);
  });

  it('parses a weekday with forwardDate semantics', () => {
    const r = parseQuickAdd('Email boss friday', NOW);
    expect(r.title).toBe('Email boss');
    // The coming Friday is 26 June 2026.
    expect(r.dueDate!.getDate()).toBe(26);
  });

  it('handles a fully-loaded line', () => {
    const r = parseQuickAdd('Review PR tomorrow at 5pm #Eng @review p2 every week', NOW);
    expect(r.title).toBe('Review PR');
    expect(r.projectName).toBe('Eng');
    expect(r.labelNames).toEqual(['review']);
    expect(r.priority).toBe(2);
    expect(r.recurrence).toBe('every week');
    expect(r.dueDate!.getDate()).toBe(25);
    expect(r.dueDate!.getHours()).toBe(17);
  });
});
