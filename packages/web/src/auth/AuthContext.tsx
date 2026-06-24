import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setTokens } from '../api/client';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
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

  async function loadUser(): Promise<void> {
    try {
      setUser(await api.me());
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    void (async () => {
      // Google OAuth redirect returns tokens in the URL fragment.
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
