import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useI18n, type Lang } from '../i18n';
import type { Filter, Label, Project } from '../types';
import type { View } from '../app/view';

interface Props {
  projects: Project[];
  labels: Label[];
  filters: Filter[];
  view: View;
  onSelect: (view: View) => void;
  onReload: () => void;
}

function Item({
  active,
  icon,
  label,
  count,
  color,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  count?: number;
  color?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
        active ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-line/60'
      }`}
    >
      {color ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      ) : (
        <span className="w-4 text-center">{icon}</span>
      )}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && <span className="text-xs text-muted">{count}</span>}
    </button>
  );
}

export function Sidebar({ projects, labels, filters, view, onSelect, onReload }: Props) {
  const { t, lang, setLang } = useI18n();
  const { user, logout } = useAuth();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const inbox = projects.find((p) => p.isInbox);
  const realProjects = projects.filter((p) => !p.isInbox);
  const favorites = projects.filter((p) => p.isFavorite);

  async function addProject() {
    if (!name.trim()) return;
    await api.createProject({ name: name.trim() });
    setName('');
    setAdding(false);
    onReload();
  }

  const is = (k: View['kind'], id?: string) =>
    view.kind === k && (id === undefined || (view as { id?: string }).id === id);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-semibold text-brand">{t('app.name')}</span>
        <div className="flex items-center gap-2 text-sm">
          <button
            className="text-muted hover:text-ink"
            onClick={() => setLang((lang === 'fr' ? 'en' : 'fr') as Lang)}
            title="FR / EN"
          >
            {lang.toUpperCase()}
          </button>
          <button className="text-muted hover:text-ink" onClick={() => onSelect({ kind: 'settings' })} title="Settings">
            ⚙
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <Item active={is('today')} icon="📆" label={t('nav.today')} onClick={() => onSelect({ kind: 'today' })} />
        <Item active={is('upcoming')} icon="🗓" label={t('nav.upcoming')} onClick={() => onSelect({ kind: 'upcoming' })} />
        {inbox && (
          <Item active={is('inbox')} icon="📥" label={t('nav.inbox')} onClick={() => onSelect({ kind: 'inbox', id: inbox.id })} />
        )}

        {favorites.length > 0 && (
          <Section title={t('nav.favorites')}>
            {favorites.map((p) => (
              <Item key={p.id} active={is('project', p.id)} icon="#" color={p.color} label={p.name} onClick={() => onSelect({ kind: 'project', id: p.id })} />
            ))}
          </Section>
        )}

        <Section
          title={t('nav.projects')}
          action={
            <button className="text-muted hover:text-brand" onClick={() => setAdding((v) => !v)} title={t('project.add')}>
              ＋
            </button>
          }
        >
          {adding && (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addProject()}
              onBlur={() => setAdding(false)}
              placeholder={t('project.name')}
              className="mb-1 w-full rounded border border-line px-2 py-1 text-sm outline-none focus:border-brand"
            />
          )}
          {realProjects.map((p) => (
            <Item key={p.id} active={is('project', p.id)} icon="#" color={p.color} label={p.name} onClick={() => onSelect({ kind: 'project', id: p.id })} />
          ))}
        </Section>

        {labels.length > 0 && (
          <Section title={t('nav.filtersLabels')}>
            {filters.map((f) => (
              <Item key={f.id} active={is('filter', f.id)} icon="🔎" color={f.color} label={f.name} onClick={() => onSelect({ kind: 'filter', id: f.id })} />
            ))}
            {labels.map((l) => (
              <Item key={l.id} active={is('label', l.id)} icon="@" color={l.color} label={l.name} onClick={() => onSelect({ kind: 'label', id: l.id })} />
            ))}
          </Section>
        )}
      </nav>

      <div className="border-t border-line px-4 py-2 text-xs text-muted">
        <div className="truncate">{user?.displayName ?? user?.email}</div>
        <button className="mt-1 hover:text-brand" onClick={() => void logout()}>
          {t('common.logout')}
        </button>
      </div>
    </aside>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}
