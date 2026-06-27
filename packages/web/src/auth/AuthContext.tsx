import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setTokens } from '../api/client';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** True when a mindlog-id sign-in needs an email before the account can be created. */
  mindlogIdNeedsEmail: boolean;
  completeMindlogId: (email: string) => Promise<void>;
  cancelMindlogId: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  async function loadUser(): Promise<void> {
    try {
      setUser(await api.me());
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    void (async () => {
      // OAuth redirect returns either tokens or, for mindlog id without an email,
      // a pending token in the URL fragment.
      if (window.location.hash.includes('access_token')) {
        const p = new URLSearchParams(window.location.hash.slice(1));
        const access = p.get('access_token');
        const refresh = p.get('refresh_token');
        if (access && refresh) setTokens(access, refresh);
        window.history.replaceState({}, '', window.location.pathname);
        await loadUser();
        setLoading(false);
        return;
      }
      if (window.location.hash.includes('mindlog_id_pending')) {
        const p = new URLSearchParams(window.location.hash.slice(1));
        const token = p.get('mindlog_id_pending');
        window.history.replaceState({}, '', window.location.pathname);
        if (token) setPendingToken(token);
        setLoading(false);
        return;
      }
      if (await api.restoreSession()) await loadUser();
      setLoading(false);
    })();
  }, []);

  const value: AuthState = {
    user,
    loading,
    login: async (email, password) => {
      await api.login(email, password);
      await loadUser();
    },
    register: async (email, password, displayName) => {
      await api.register(email, password, displayName);
      await loadUser();
    },
    logout: async () => {
      await api.logout();
      setUser(null);
    },
    mindlogIdNeedsEmail: pendingToken !== null,
    completeMindlogId: async (email) => {
      if (!pendingToken) return;
      await api.completeMindlogId(pendingToken, email);
      setPendingToken(null);
      await loadUser();
    },
    cancelMindlogId: () => setPendingToken(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
