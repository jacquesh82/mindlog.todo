import { describe, expect, it } from 'vitest';
import {
  TASK_PRIORITY_DEFAULT,
  taskCreateSchema,
  taskListQuerySchema,
  taskUpdateSchema,
} from '../src/domain/task.js';

describe('task priority schema', () => {
  it('accepts P1–P4', () => {
    for (const p of [1, 2, 3, 4]) {
      expect(taskCreateSchema.parse({ title: 'x', priority: p }).priority).toBe(p);
    }
  });

  it('rejects out-of-range priorities', () => {
    expect(() => taskCreateSchema.parse({ title: 'x', priority: 0 })).toThrow();
    expect(() => taskCreateSchema.parse({ title: 'x', priority: 5 })).toThrow();
    expect(() => taskCreateSchema.parse({ title: 'x', priority: 2.5 })).toThrow();
  });

  it('leaves priority undefined when omitted (repo applies the P4 default)', () => {
    expect(taskCreateSchema.parse({ title: 'x' }).priority).toBeUndefined();
    expect(TASK_PRIORITY_DEFAULT).toBe(4);
  });

  it('coerces a query-string priority for list filtering', () => {
    expect(taskListQuerySchema.parse({ priority: '1' }).priority).toBe(1);
  });

  it('allows updating priority alone', () => {
    expect(taskUpdateSchema.parse({ priority: 3 })).toEqual({ priority: 3 });
  });
});

describe('task date schema', () => {
  it('accepts a YYYY-MM-DD deadline and a positive duration', () => {
    const parsed = taskCreateSchema.parse({ title: 'x', deadline: '2026-07-15', durationMinutes: 90 });
    expect(parsed.deadline).toBe('2026-07-15');
    expect(parsed.durationMinutes).toBe(90);
  });

  it('rejects a non-date deadline and a non-positive duration', () => {
    expect(() => taskCreateSchema.parse({ title: 'x', deadline: '15/07/2026' })).toThrow();
    expect(() => taskCreateSchema.parse({ title: 'x', durationMinutes: 0 })).toThrow();
  });

  it('allows clearing deadline/duration with null on update', () => {
    expect(taskUpdateSchema.parse({ deadline: null, durationMinutes: null })).toEqual({
      deadline: null,
      durationMinutes: null,
    });
  });
});
