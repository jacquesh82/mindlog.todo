import { describe, expect, it } from 'vitest';
import { parseTaskLines } from '../src/rag/extract-tasks.js';

describe('parseTaskLines', () => {
  it('returns one task per non-empty line', () => {
    expect(parseTaskLines('Buy milk\nCall Sam\n\nShip release')).toEqual([
      'Buy milk',
      'Call Sam',
      'Ship release',
    ]);
  });

  it('strips leading bullets, numbers and checkboxes', () => {
    const out = parseTaskLines('- Buy milk\n2. Call Sam\n* Email Bob\n[ ] Pay rent\n☑ Done thing');
    expect(out).toEqual(['Buy milk', 'Call Sam', 'Email Bob', 'Pay rent', 'Done thing']);
  });

  it('preserves Todoist quick-add syntax in the task text', () => {
    expect(parseTaskLines('- Submit report tomorrow #Work @urgent p1')).toEqual([
      'Submit report tomorrow #Work @urgent p1',
    ]);
  });

  it('de-duplicates case-insensitively, keeping first occurrence', () => {
    expect(parseTaskLines('Buy milk\nbuy milk\nBUY MILK\nCall Sam')).toEqual(['Buy milk', 'Call Sam']);
  });

  it('drops empty / marker-only lines', () => {
    expect(parseTaskLines('\n-\n  \n[ ]\nReal task')).toEqual(['Real task']);
  });

  it('caps the list at 50 items', () => {
    const many = Array.from({ length: 80 }, (_, i) => `Task ${i}`).join('\n');
    expect(parseTaskLines(many)).toHaveLength(50);
  });
});
