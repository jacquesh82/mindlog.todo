export type View =
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'completed' }
  | { kind: 'notes'; pageId?: string }
  | { kind: 'dashboard' }
  | { kind: 'search'; mode?: 'search' | 'ask' }
  | { kind: 'inbox'; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'label'; id: string }
  | { kind: 'filter'; id: string }
  | { kind: 'settings' };
