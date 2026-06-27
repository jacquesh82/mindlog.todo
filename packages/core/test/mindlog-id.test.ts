import { describe, expect, it } from 'vitest';
import { hasAgendaScope, MINDLOG_ID_AGENDA_SCOPE } from '../src/auth/mindlog-id.js';

describe('hasAgendaScope', () => {
  it('detects the agenda scope among granted scopes', () => {
    expect(hasAgendaScope('openid email profile mindlog:agenda')).toBe(true);
    expect(hasAgendaScope(MINDLOG_ID_AGENDA_SCOPE)).toBe(true);
  });

  it('is false when the agenda scope was not granted', () => {
    expect(hasAgendaScope('openid email profile mindlog:relations')).toBe(false);
    expect(hasAgendaScope('')).toBe(false);
  });

  it('does not match a scope that merely contains the substring', () => {
    expect(hasAgendaScope('mindlog:agenda-readonly')).toBe(false);
  });
});
