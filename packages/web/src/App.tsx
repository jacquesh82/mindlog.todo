import { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { TasksPage } from './pages/TasksPage';
import { applyTheme, type Theme } from './theme';

type Tab = 'tasks' | 'keys';

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) ?? 'light',
  );
  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }
  return (
    <button className="icon-btn" onClick={toggle} title="Toggle dark / light theme" aria-label="Toggle theme">
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

export function App() {
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('tasks');

  if (loading) return <div className="center muted">Loading…</div>;
  if (!user)
    return (
      <div className="center">
        <div className="login-shell">
          <div className="login-topbar">
            <ThemeToggle />
          </div>
          <LoginPage />
        </div>
      </div>
    );

  return (
    <div className="app">
      <header>
        <h1>mindlog.todo</h1>
        <nav>
          <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
            Tasks
          </button>
          <button className={tab === 'keys' ? 'active' : ''} onClick={() => setTab('keys')}>
            API keys
          </button>
        </nav>
        <div className="user">
          <ThemeToggle />
          <span className="muted">{user.displayName ?? user.email}</span>
          <button className="link" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <main>{tab === 'tasks' ? <TasksPage /> : <ApiKeysPage />}</main>
    </div>
  );
}
