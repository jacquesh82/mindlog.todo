import { useCallback, useEffect, useRef, useState } from 'react';
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

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-ink">
      <Sidebar
        projects={projects}
        labels={labels}
        filters={filters}
        karma={karma}
        counts={counts}
        view={view}
        onSelect={setView}
        onReload={reloadSidebar}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onAdded={reloadSidebar} />
        <main className="flex-1 overflow-y-auto">
        <SelectionProvider>
        {(() => {
          if (view.kind === 'settings') return <SettingsPage />;
          if (view.kind === 'search') return <SearchAskView projects={projects} labels={labels} onChanged={reloadSidebar} />;
          if (view.kind === 'notes') return <NotesView />;
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
      </div>
    </div>
  );
}
