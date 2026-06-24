import { describe, expect, it } from 'vitest';
import { projectCreateSchema, projectUpdateSchema } from '../src/domain/project.js';

describe('project schema', () => {
  it('accepts a minimal project', () => {
    expect(projectCreateSchema.parse({ name: 'Work' }).name).toBe('Work');
  });

  it('validates the colour as a #rrggbb hex', () => {
    expect(projectCreateSchema.parse({ name: 'x', color: '#db4c3f' }).color).toBe('#db4c3f');
    expect(() => projectCreateSchema.parse({ name: 'x', color: 'red' })).toThrow();
    expect(() => projectCreateSchema.parse({ name: 'x', color: '#fff' })).toThrow();
  });

  it('rejects an unknown view mode', () => {
    expect(() => projectCreateSchema.parse({ name: 'x', viewMode: 'gantt' })).toThrow();
    expect(projectCreateSchema.parse({ name: 'x', viewMode: 'board' }).viewMode).toBe('board');
  });

  it('requires a non-empty name', () => {
    expect(() => projectCreateSchema.parse({ name: '' })).toThrow();
  });

  it('allows clearing colour/parent via null on update', () => {
    expect(projectUpdateSchema.parse({ color: null, parentId: null })).toEqual({
      color: null,
      parentId: null,
    });
  });
});
