import { describe, expect, it } from 'vitest';
import { levelFor, streakFrom } from '../src/domain/karma.js';

describe('levelFor', () => {
  it('maps points to the right level and next threshold', () => {
    expect(levelFor(0)).toEqual({ level: 'Beginner', nextLevel: 'Novice', pointsToNext: 50 });
    expect(levelFor(60)).toEqual({ level: 'Novice', nextLevel: 'Intermediate', pointsToNext: 90 });
    expect(levelFor(1200)).toMatchObject({ level: 'Expert' });
  });

  it('has no next level at the top', () => {
    expect(levelFor(20000)).toEqual({ level: 'Enlightened', nextLevel: null, pointsToNext: null });
  });
});

describe('streakFrom', () => {
  const today = new Date('2026-06-24T12:00:00Z');

  it('counts consecutive days ending today', () => {
    expect(streakFrom(['2026-06-24', '2026-06-23', '2026-06-22'], today)).toBe(3);
  });

  it('counts from yesterday when nothing today', () => {
    expect(streakFrom(['2026-06-23', '2026-06-22'], today)).toBe(2);
  });

  it('stops at a gap', () => {
    expect(streakFrom(['2026-06-24', '2026-06-22', '2026-06-21'], today)).toBe(1);
  });

  it('is zero when the most recent day is too old', () => {
    expect(streakFrom(['2026-06-20'], today)).toBe(0);
    expect(streakFrom([], today)).toBe(0);
  });
});
