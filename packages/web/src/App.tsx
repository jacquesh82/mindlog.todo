import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { MainView } from './components/MainView';
import { Sidebar } from './components/Sidebar';
import { useI18n } from './i18n';
import { ProjectView } from './pages/ProjectView';
import { SearchAskView } from './pages/SearchAskView';
import { SettingsPage } from './pages/SettingsPage';
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

  const reloadSidebar = useCallback(() => {
    if (!user) return;
    void Promise.all([
      api.listProjects(),
      api.listLabels(),
      api.listFilters(),
      api.getKarma(),
    ]).then(([p, l, f, k]) => {
      setProjects(p);
      setLabels(l);
      setFilters(f);
      setKarma(k);
    });
  }, [user]);

  useEffect(() => {
    reloadSidebar();
  }, [reloadSidebar]);

  if (loading) return <div className="flex h-screen items-center justify-center text-muted">{t('common.loading')}</div>;
  if (!user)
    return (
      <div className="legacy flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="login-shell">
          <LoginPage />
        </div>
      </div>
    );

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-ink">
      <Sidebar
        projects={projects}
        labels={labels}
        filters={filters}
        karma={karma}
        view={view}
        onSelect={setView}
        onReload={reloadSidebar}
      />
      <main className="flex-1 overflow-y-auto">
        {(() => {
          if (view.kind === 'settings') return <SettingsPage />;
          if (view.kind === 'search') return <SearchAskView />;
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
      </main>
    </div>
  );
}
