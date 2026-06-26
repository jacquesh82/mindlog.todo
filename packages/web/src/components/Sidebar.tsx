import { useState, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useI18n, type Lang } from '../i18n';
import { useToast } from '../toast';
import type { Filter, Karma, Label, Project } from '../types';
import type { View } from '../app/view';
import { FilterModal } from './FilterModal';
import { LabelModal } from './LabelModal';
import { ProjectModal } from './ProjectModal';
import { FunnelIcon, HashIcon, TagIcon } from './SidebarIcons';

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
  glyph,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon?: string;
  /** A coloured SVG glyph; overrides the text `icon`. */
  glyph?: ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
        active ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-line/60'
      }`}
    >
      {glyph ? (
        <span className="flex w-4 shrink-0 justify-center">{glyph}</span>
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
  const { toast } = useToast();
  // null = closed, 'create' = new project, Project = edit that project.
  const [modal, setModal] = useState<'create' | Project | null>(null);
  const [labelModal, setLabelModal] = useState<'create' | Label | null>(null);
  const [filterModal, setFilterModal] = useState<'create' | Filter | null>(null);
  const [rootOver, setRootOver] = useState(false);

  /** Drag-and-drop reparent: make `childId` a child of `parentId` (null = root). */
  async function reparent(childId: string, parentId: string | null) {
    if (childId === parentId) return;
    try {
      await api.updateProject(childId, { parentId });
      onReload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Move failed', 'error');
    }
  }

  const inbox = projects.find((p) => p.isInbox);
  const realProjects = projects.filter((p) => !p.isInbox);
  // Flatten the project hierarchy depth-first for indented rendering.
  const ids = new Set(realProjects.map((p) => p.id));
  const byParent = new Map<string | null, Project[]>();
  for (const p of realProjects) {
    const key = p.parentId && ids.has(p.parentId) ? p.parentId : null;
    (byParent.get(key) ?? byParent.set(key, []).get(key)!).push(p);
  }
  const orderedProjects: { project: Project; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const p of byParent.get(parent) ?? []) {
      orderedProjects.push({ project: p, depth });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  const favProjects = projects.filter((p) => p.isFavorite);
  const favLabels = labels.filter((l) => l.isFavorite);
  const hasFavorites = favProjects.length > 0 || favLabels.length > 0;

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
        {/* Cross-cutting tools (not tied to tasks) sit at the very top. */}
        <Item active={is('search')} icon="🔎" label={t('nav.search')} onClick={() => onSelect({ kind: 'search' })} />
        <Item active={is('notes')} icon="📓" label={t('nav.notes')} onClick={() => onSelect({ kind: 'notes' })} />

        <Section title={t('nav.tasks')}>
          <Item active={is('today')} icon="📆" label={t('nav.today')} onClick={() => onSelect({ kind: 'today' })} />
          <Item active={is('upcoming')} icon="🗓" label={t('nav.upcoming')} onClick={() => onSelect({ kind: 'upcoming' })} />
          {inbox && (
            <Item active={is('inbox')} icon="📥" label={t('nav.inbox')} onClick={() => onSelect({ kind: 'inbox', id: inbox.id })} />
          )}
          <Item active={is('completed')} icon="✓" label={t('nav.completed')} onClick={() => onSelect({ kind: 'completed' })} />
        </Section>

        {hasFavorites && (
          <Section title={t('nav.favorites')}>
            {favProjects.map((p) => (
              <Item key={p.id} active={is('project', p.id)} glyph={<HashIcon color={p.color} />} label={p.name} onClick={() => onSelect({ kind: 'project', id: p.id })} />
            ))}
            {favLabels.map((l) => (
              <Item key={l.id} active={is('label', l.id)} glyph={<TagIcon color={l.color} />} label={l.name} onClick={() => onSelect({ kind: 'label', id: l.id })} />
            ))}
          </Section>
        )}

        <Section
          title={t('nav.filters')}
          action={
            <button className="text-muted hover:text-brand" onClick={() => setFilterModal('create')} title={t('filter.add')}>
              ＋
            </button>
          }
        >
          {filters.map((f) => (
            <EditableRow
              key={f.id}
              active={is('filter', f.id)}
              glyph={<FunnelIcon color={f.color} />}
              label={f.name}
              onOpen={() => onSelect({ kind: 'filter', id: f.id })}
              onEdit={() => setFilterModal(f)}
            />
          ))}
          {filters.length === 0 && (
            <button onClick={() => setFilterModal('create')} className="px-2 py-1.5 text-sm text-muted hover:text-brand">
              ＋ {t('filter.add')}
            </button>
          )}
        </Section>

        <Section
          title={t('nav.labels')}
          action={
            <button className="text-muted hover:text-brand" onClick={() => setLabelModal('create')} title={t('label.add')}>
              ＋
            </button>
          }
        >
          {labels.map((l) => (
            <EditableRow
              key={l.id}
              active={is('label', l.id)}
              glyph={<TagIcon color={l.color} />}
              label={l.name}
              onOpen={() => onSelect({ kind: 'label', id: l.id })}
              onEdit={() => setLabelModal(l)}
            />
          ))}
          {labels.length === 0 && (
            <button onClick={() => setLabelModal('create')} className="px-2 py-1.5 text-sm text-muted hover:text-brand">
              ＋ {t('label.add')}
            </button>
          )}
        </Section>

        <div
          onDragOver={(e) => { e.preventDefault(); setRootOver(true); }}
          onDragLeave={() => setRootOver(false)}
          onDrop={(e) => {
            setRootOver(false);
            const id = e.dataTransfer.getData('text/project');
            if (id) void reparent(id, null);
          }}
          className={rootOver ? 'rounded-md ring-2 ring-brand' : ''}
        >
        <Section
          title={t('nav.projects')}
          action={
            <button className="text-muted hover:text-brand" onClick={() => setModal('create')} title={t('project.add')}>
              ＋
            </button>
          }
        >
          {orderedProjects.map(({ project: p, depth }) => (
            <ProjectRow
              key={p.id}
              project={p}
              depth={depth}
              active={is('project', p.id)}
              onOpen={() => onSelect({ kind: 'project', id: p.id })}
              onEdit={() => setModal(p)}
              onReparent={reparent}
            />
          ))}
          {realProjects.length === 0 && (
            <button onClick={() => setModal('create')} className="px-2 py-1.5 text-sm text-muted hover:text-brand">
              ＋ {t('project.add')}
            </button>
          )}
        </Section>
        </div>
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
          projects={projects}
          onClose={() => setModal(null)}
          onSaved={onReload}
        />
      )}
      {labelModal !== null && (
        <LabelModal
          label={labelModal === 'create' ? undefined : labelModal}
          onClose={() => setLabelModal(null)}
          onSaved={onReload}
        />
      )}
      {filterModal !== null && (
        <FilterModal
          filter={filterModal === 'create' ? undefined : filterModal}
          onClose={() => setFilterModal(null)}
          onSaved={onReload}
        />
      )}
    </aside>
  );
}

/** A nav row with a coloured glyph and a hover ⋯ edit affordance (filters, labels). */
function EditableRow({
  active,
  glyph,
  label,
  onOpen,
  onEdit,
}: {
  active: boolean;
  glyph: ReactNode;
  label: string;
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
        <span className="flex w-4 shrink-0 justify-center">{glyph}</span>
        <span className="flex-1 truncate">{label}</span>
      </button>
      <button
        onClick={onEdit}
        title="Edit"
        className="absolute right-1 px-1 text-muted opacity-0 transition hover:text-brand group-hover:opacity-100"
      >
        ⋯
      </button>
    </div>
  );
}

/** A project nav row with a hover "edit" affordance (avoids nested buttons). */
function ProjectRow({
  project,
  active,
  depth = 0,
  onOpen,
  onEdit,
  onReparent,
}: {
  project: Project;
  active: boolean;
  depth?: number;
  onOpen: () => void;
  onEdit: () => void;
  onReparent: (childId: string, parentId: string) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`group relative flex items-center rounded-md ${over ? 'ring-2 ring-brand' : ''}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/project', project.id)}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const id = e.dataTransfer.getData('text/project');
        if (id && id !== project.id) onReparent(id, project.id);
      }}
    >
      <button
        onClick={onOpen}
        style={{ paddingLeft: 8 + depth * 16 }}
        className={`flex flex-1 items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition ${
          active ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-line/60'
        }`}
      >
        <span className="flex w-4 shrink-0 justify-center">
          <HashIcon color={project.color} />
        </span>
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
