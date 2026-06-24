import { describe, expect, it } from 'vitest';
import { labelCreateSchema, labelUpdateSchema } from '../src/domain/label.js';

describe('label schema', () => {
  it('accepts a name with optional hex colour', () => {
    expect(labelCreateSchema.parse({ name: 'home' }).color).toBeUndefined();
    expect(labelCreateSchema.parse({ name: 'home', color: '#4073ff' }).color).toBe('#4073ff');
  });

  it('rejects an empty name and a bad colour', () => {
    expect(() => labelCreateSchema.parse({ name: '' })).toThrow();
    expect(() => labelCreateSchema.parse({ name: 'x', color: 'blue' })).toThrow();
  });

  it('allows clearing the colour with null on update', () => {
    expect(labelUpdateSchema.parse({ color: null })).toEqual({ color: null });
  });
});
