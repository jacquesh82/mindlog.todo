import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n, type Lang } from '../i18n';
import type { Filter, Karma, Label, Project } from '../types';
import type { View } from '../app/view';
import { ProjectModal } from './ProjectModal';

interface Props {
  projects: Project[];
  labels: Label[];
  filters: Filter[];
  karma: Karma | null;
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

export function Sidebar({ projects, labels, filters, karma, view, onSelect, onReload }: Props) {
  const { t, lang, setLang } = useI18n();
  const { user, logout } = useAuth();
  // null = closed, 'create' = new project, Project = edit that project.
  const [modal, setModal] = useState<'create' | Project | null>(null);

  const inbox = projects.find((p) => p.isInbox);
  const realProjects = projects.filter((p) => !p.isInbox);
  const favorites = projects.filter((p) => p.isFavorite);

  const is = (k: View['kind'], id?: string) =>
    view.kind === k && (id === undefined || (view as { id?: string }).id === id);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 font-semibold text-brand">
          <img src="/milo.svg" alt="Milo" className="h-6 w-6" />
          {t('app.name')}
        </span>
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
        <Item active={is('search')} icon="🔎" label={t('nav.search')} onClick={() => onSelect({ kind: 'search' })} />
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
            <button className="text-muted hover:text-brand" onClick={() => setModal('create')} title={t('project.add')}>
              ＋
            </button>
          }
        >
          {realProjects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              active={is('project', p.id)}
              onOpen={() => onSelect({ kind: 'project', id: p.id })}
              onEdit={() => setModal(p)}
            />
          ))}
          {realProjects.length === 0 && (
            <button onClick={() => setModal('create')} className="px-2 py-1.5 text-sm text-muted hover:text-brand">
              ＋ {t('project.add')}
            </button>
          )}
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

      {karma && (
        <div className="border-t border-line px-4 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ink">⚡ {karma.level}</span>
            <span className="text-muted">{karma.points} pts</span>
          </div>
          <div className="mt-0.5 text-muted">
            🔥 {karma.streakDays} {t('karma.dayStreak')} · {karma.completedToday} {t('karma.today')}
          </div>
        </div>
      )}
      <div className="border-t border-line px-4 py-2 text-xs text-muted">
        <div className="truncate">{user?.displayName ?? user?.email}</div>
        <button className="mt-1 hover:text-brand" onClick={() => void logout()}>
          {t('common.logout')}
        </button>
      </div>

      {modal !== null && (
        <ProjectModal
          project={modal === 'create' ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={onReload}
        />
      )}
    </aside>
  );
}

/** A project nav row with a hover "edit" affordance (avoids nested buttons). */
function ProjectRow({
  project,
  active,
  onOpen,
  onEdit,
}: {
  project: Project;
  active: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="group relative flex items-center">
      <button
        onClick={onOpen}
        className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
          active ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-line/60'
        }`}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color ?? '#808080' }} />
        <span className="flex-1 truncate">{project.name}</span>
        {project.isFavorite && <span className="text-xs">★</span>}
      </button>
      <button
        onClick={onEdit}
        title="Edit"
        className="absolute right-1 opacity-0 transition group-hover:opacity-100 px-1 text-muted hover:text-brand"
      >
        ⋯
      </button>
    </div>
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
