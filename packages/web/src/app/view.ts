export type View =
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'inbox'; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'label'; id: string }
  | { kind: 'filter'; id: string }
  | { kind: 'settings' };
