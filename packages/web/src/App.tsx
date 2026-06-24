import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { MainView } from './components/MainView';
import { Sidebar } from './components/Sidebar';
import { useI18n } from './i18n';
import { SearchAskView } from './pages/SearchAskView';
import { SettingsPage } from './pages/SettingsPage';
import type { Filter, Label, Project } from './types';
import type { View } from './app/view';

export function App() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [view, setView] = useState<View>({ kind: 'today' });
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);

  const reloadSidebar = useCallback(() => {
    if (!user) return;
    void Promise.all([api.listProjects(), api.listLabels(), api.listFilters()]).then(
      ([p, l, f]) => {
        setProjects(p);
        setLabels(l);
        setFilters(f);
      },
    );
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
        view={view}
        onSelect={setView}
        onReload={reloadSidebar}
      />
      <main className="flex-1 overflow-y-auto">
        {view.kind === 'settings' ? (
          <SettingsPage />
        ) : view.kind === 'search' ? (
          <SearchAskView />
        ) : (
          <MainView
            view={view}
            projects={projects}
            labels={labels}
            filters={filters}
            onDataChanged={reloadSidebar}
          />
        )}
      </main>
    </div>
  );
}
