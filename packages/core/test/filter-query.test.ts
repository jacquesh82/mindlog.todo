import { describe, expect, it } from 'vitest';
import {
  compileFilter,
  parseFilter,
  referencedNames,
  type CompileContext,
} from '../src/domain/filter-query.js';

const ctx = (): CompileContext => ({
  labelIds: new Map([['work', 'L-work']]),
  projectIds: new Map([['home', 'P-home']]),
});

describe('parseFilter', () => {
  it('parses atoms', () => {
    expect(parseFilter('p1')).toEqual({ t: 'priority', n: 1 });
    expect(parseFilter('@work')).toEqual({ t: 'label', name: 'work' });
    expect(parseFilter('#Home')).toEqual({ t: 'project', name: 'Home' });
    expect(parseFilter('overdue')).toEqual({ t: 'overdue' });
    expect(parseFilter('no date')).toEqual({ t: 'noDate' });
    expect(parseFilter('no labels')).toEqual({ t: 'noLabels' });
    expect(parseFilter('7 days')).toEqual({ t: 'dueWithin', days: 7 });
  });

  it('respects precedence: OR < AND, with parentheses', () => {
    // a | b & c  ==  a | (b & c)
    expect(parseFilter('p1 | p2 & p3')).toEqual({
      t: 'or',
      l: { t: 'priority', n: 1 },
      r: { t: 'and', l: { t: 'priority', n: 2 }, r: { t: 'priority', n: 3 } },
    });
    expect(parseFilter('(p1 | p2) & p3')).toEqual({
      t: 'and',
      l: { t: 'or', l: { t: 'priority', n: 1 }, r: { t: 'priority', n: 2 } },
      r: { t: 'priority', n: 3 },
    });
  });

  it('parses negation and comma-as-or', () => {
    expect(parseFilter('!@work')).toEqual({ t: 'not', e: { t: 'label', name: 'work' } });
    expect(parseFilter('p1, p2')).toEqual({
      t: 'or',
      l: { t: 'priority', n: 1 },
      r: { t: 'priority', n: 2 },
    });
  });

  it('throws on malformed input', () => {
    expect(() => parseFilter('')).toThrow();
    expect(() => parseFilter('(p1')).toThrow();
    expect(() => parseFilter('p1 &')).toThrow();
    expect(() => parseFilter('garbage!!')).toThrow();
  });
});

describe('referencedNames', () => {
  it('collects label and project names', () => {
    expect(referencedNames(parseFilter('@work & #Home & !@personal'))).toEqual({
      labels: ['work', 'personal'],
      projects: ['Home'],
    });
  });
});

describe('compileFilter', () => {
  it('compiles a full expression with placeholders', () => {
    const { sql, params } = compileFilter(parseFilter('(p1 | p2) & @work'), ctx());
    expect(sql).toBe(
      "((priority = $1 OR priority = $2) AND id IN (SELECT task_id FROM task_labels WHERE label_id = $3))",
    );
    expect(params).toEqual([1, 2, 'L-work']);
  });

  it('honours a non-default start index', () => {
    const { sql, params } = compileFilter(parseFilter('p3'), ctx(), 5);
    expect(sql).toBe('priority = $5');
    expect(params).toEqual([3]);
  });

  it('compiles an unknown label/project to a false predicate', () => {
    expect(compileFilter(parseFilter('@ghost'), ctx()).sql).toBe('false');
    expect(compileFilter(parseFilter('#ghost'), ctx()).sql).toBe('false');
  });

  it('compiles date atoms to SQL', () => {
    expect(compileFilter(parseFilter('today'), ctx()).sql).toContain('current_date');
    expect(compileFilter(parseFilter('overdue'), ctx()).sql).toContain("NOT IN ('done','cancelled')");
    expect(compileFilter(parseFilter('no labels'), ctx()).sql).toContain('NOT IN (SELECT task_id');
  });
});
