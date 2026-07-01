import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api/client';
import { connectServerEvents, useServerEvents } from './api/events';
import { useAuth } from './auth/AuthContext';
import { AuthorizePage } from './auth/AuthorizePage';
import { LoginPage } from './auth/LoginPage';
import { ResetPasswordPage } from './auth/ResetPasswordPage';
import { Header } from './components/Header';
import { MainView } from './components/MainView';
import { Sidebar, type SidebarCounts } from './components/Sidebar';
import { startOfToday, startOfTomorrow } from './format';
import { useI18n } from './i18n';
import { DashboardView } from './pages/DashboardView';
import { NotesView } from './pages/NotesView';
import { ProjectView } from './pages/ProjectView';
import { SearchAskView } from './pages/SearchAskView';
import { SelectionProvider } from './selection/Selection';
import { SettingsPage } from './pages/SettingsPage';
import { maybeStartTour } from './tour';
import type { Filter, Karma, Label, Project } from './types';
import type { View } from './app/view';

export function App() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [view, setView] = useState<View>({ kind: 'today' });
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [karma, setKarma] = useState<Karma | null>(null);
  const [counts, setCounts] = useState<SidebarCounts | null>(null);
  // Mobile navigation drawer (hidden/ignored from `md` up, where the sidebar is static).
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Selecting a destination also dismisses the mobile drawer so the chosen view is visible.
  const selectView = useCallback((next: View) => {
    setView(next);
    setDrawerOpen(false);
  }, []);

  const reloadSidebar = useCallback(() => {
    if (!user) return;
    void Promise.all([
      api.listProjects(),
      api.listLabels(),
      api.listFilters(),
      api.getKarma(),
      api.listTasks({ completed: 'false' }),
    ]).then(async ([p, l, f, k, open]) => {
      setProjects(p);
      setLabels(l);
      setFilters(f);
      setKarma(k);

      // Unfinished-task counts for the sidebar. Smart-view bounds mirror MainView
      // (today = due before tomorrow incl. overdue; upcoming = due from today on).
      const tomorrow = startOfTomorrow();
      const today = startOfToday();
      const inboxId = p.find((proj) => proj.isInbox)?.id;
      const byProject: Record<string, number> = {};
      const byLabel: Record<string, number> = {};
      for (const task of open) {
        if (task.projectId) byProject[task.projectId] = (byProject[task.projectId] ?? 0) + 1;
        for (const labelId of task.labelIds ?? []) byLabel[labelId] = (byLabel[labelId] ?? 0) + 1;
      }
      // Per-filter counts: run each saved filter and count non-done results.
      const filterResults = await Promise.all(f.map((flt) => api.runFilter(flt.id).catch(() => [])));
      const byFilter: Record<string, number> = {};
      f.forEach((flt, i) => {
        byFilter[flt.id] = (filterResults[i] ?? []).filter((task) => task.status !== 'done').length;
      });
      setCounts({
        today: open.filter((task) => task.dueDate && new Date(task.dueDate) < tomorrow).length,
        upcoming: open.filter((task) => task.dueDate && new Date(task.dueDate) >= today).length,
        inbox: inboxId ? open.filter((task) => task.projectId === inboxId).length : 0,
        byProject,
        byLabel,
        byFilter,
      });
    });
  }, [user]);

  useEffect(() => {
    reloadSidebar();
  }, [reloadSidebar]);

  // Open the real-time change stream while signed in (covers MCP-driven changes).
  useEffect(() => {
    if (!user) return;
    return connectServerEvents();
  }, [user]);

  // Refresh the sidebar (projects/labels/filters/karma) on any server change.
  useServerEvents(reloadSidebar);

  // First-login guided tour (no-op if already seen or disabled).
  const tourStarted = useRef(false);
  useEffect(() => {
    if (user && !tourStarted.current) {
      tourStarted.current = true;
      maybeStartTour(t);
    }
  }, [user, t]);

  // Password-reset deep link (`/auth/reset?token=…`) — handled before the auth gate.
  const resetToken = window.location.pathname.endsWith('/auth/reset')
    ? new URLSearchParams(window.location.search).get('token')
    : null;
  if (resetToken)
    return (
      <div className="legacy flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-1.5">
          <img src={`${import.meta.env.BASE_URL}milo.svg`} alt="Milo" className="h-16 w-16" />
          <div className="text-lg font-semibold" style={{ color: 'var(--color-brand)' }}>
            {t('app.name')}
          </div>
          <div className="text-sm" style={{ color: 'var(--color-muted)' }}>{t('login.tagline')}</div>
        </div>
        <div className="login-shell">
          <ResetPasswordPage token={resetToken} />
        </div>
      </div>
    );

  // OAuth consent deep link (`/authorize?…`) for remote MCP clients (Claude).
  // Handles its own loading/login state, so branch before the auth gate.
  if (window.location.pathname.endsWith('/authorize')) return <AuthorizePage />;

  if (loading) return <div className="flex h-screen items-center justify-center text-muted">{t('common.loading')}</div>;
  if (!user)
    return (
      <div className="legacy flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-1.5">
          <img src={`${import.meta.env.BASE_URL}milo.svg`} alt="Milo" className="h-16 w-16" />
          <div className="text-lg font-semibold" style={{ color: 'var(--color-brand)' }}>
            {t('app.name')}
          </div>
          <div className="text-sm" style={{ color: 'var(--color-muted)' }}>{t('login.tagline')}</div>
        </div>
        <div className="login-shell">
          <LoginPage />
        </div>
        <a
          href="https://id.mindlog.today/"
          target="_blank"
          rel="noreferrer"
          className="text-xs hover:underline"
          style={{ color: 'var(--color-muted)' }}
        >
          {t('login.mindlogId')} ↗
        </a>
      </div>
    );

  const inboxId = projects.find((p) => p.isInbox)?.id;

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-ink">
      {/* Scrim: dims and closes the drawer on phones. Absent from `md` up. */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}
      <Sidebar
        projects={projects}
        labels={labels}
        filters={filters}
        karma={karma}
        counts={counts}
        view={view}
        onSelect={selectView}
        onReload={reloadSidebar}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onAdded={reloadSidebar} onMenu={() => setDrawerOpen(true)} />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <SelectionProvider>
        {(() => {
          if (view.kind === 'settings') return <SettingsPage />;
          if (view.kind === 'search')
            return (
              <SearchAskView
                projects={projects}
                labels={labels}
                onChanged={reloadSidebar}
                onOpenNote={(pageId) => setView({ kind: 'notes', pageId })}
                initialMode={view.mode}
              />
            );
          if (view.kind === 'notes') return <NotesView initialPageId={view.pageId} />;
          if (view.kind === 'dashboard') return <DashboardView />;
          if (view.kind === 'project' || view.kind === 'inbox') {
            const project = projects.find((p) => p.id === view.id);
            if (project) {
              return (
                <ProjectView
                  key={project.id}
                  project={project}
                  projects={projects}
                  labels={labels}
                  onDataChanged={reloadSidebar}
                />
              );
            }
          }
          return (
            <MainView
              view={view}
              projects={projects}
              labels={labels}
              filters={filters}
              onDataChanged={reloadSidebar}
            />
          );
        })()}
        </SelectionProvider>
        </main>
        <MobileTabBar view={view} inboxId={inboxId} onSelect={selectView} />
      </div>
    </div>
  );
}

/** 24×24 stroke icon wrapper (Lucide-style) used by the mobile bottom bar. */
function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * Android-style bottom navigation for the top-level destinations. Phone-only
 * (`md:hidden`); everything else (projects, labels, filters, settings…) lives in
 * the drawer reachable from the hamburger.
 */
function MobileTabBar({
  view,
  inboxId,
  onSelect,
}: {
  view: View;
  inboxId?: string;
  onSelect: (view: View) => void;
}) {
  const { t } = useI18n();
  const tabs: { key: string; label: string; icon: ReactNode; target: View; active: boolean }[] = [
    {
      key: 'today',
      label: t('nav.today'),
      target: { kind: 'today' },
      active: view.kind === 'today',
      icon: (
        <TabIcon>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
          <path d="m9 16 2 2 4-4" />
        </TabIcon>
      ),
    },
    ...(inboxId
      ? [
          {
            key: 'inbox',
            label: t('nav.inbox'),
            target: { kind: 'inbox', id: inboxId } as View,
            active: view.kind === 'inbox',
            icon: (
              <TabIcon>
                <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </TabIcon>
            ),
          },
        ]
      : []),
    {
      key: 'notes',
      label: t('nav.notes'),
      target: { kind: 'notes' },
      active: view.kind === 'notes',
      icon: (
        <TabIcon>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </TabIcon>
      ),
    },
    {
      key: 'search',
      label: t('nav.searchShort'),
      target: { kind: 'search', mode: 'search' },
      active: view.kind === 'search' && view.mode !== 'ask',
      icon: (
        <TabIcon>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </TabIcon>
      ),
    },
    {
      key: 'ask',
      label: t('nav.askAi'),
      target: { kind: 'search', mode: 'ask' },
      active: view.kind === 'search' && view.mode === 'ask',
      icon: (
        <TabIcon>
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
        </TabIcon>
      ),
    },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-stretch border-t border-line bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onSelect(tab.target)}
          aria-current={tab.active ? 'page' : undefined}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition ${
            tab.active ? 'text-brand' : 'text-muted hover:text-ink'
          }`}
        >
          {tab.icon}
          <span className="max-w-full truncate px-1">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
