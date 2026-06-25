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
      <div className="legacy flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-1.5">
          <img src="/milo.svg" alt="Milo" className="h-16 w-16" />
          <div className="text-lg font-semibold" style={{ color: 'var(--color-brand)' }}>
            {t('app.name')}
          </div>
          <div className="text-sm" style={{ color: 'var(--color-muted)' }}>{t('login.tagline')}</div>
        </div>
        <div className="login-shell">
          <LoginPage />
        </div>
        <a
          href="https://id.mindlog.localhost"
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
        view={view}
        onSelect={setView}
        onReload={reloadSidebar}
      />
      <main className="flex-1 overflow-y-auto">
        {(() => {
          if (view.kind === 'settings') return <SettingsPage />;
          if (view.kind === 'search') return <SearchAskView projects={projects} labels={labels} onChanged={reloadSidebar} />;
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
