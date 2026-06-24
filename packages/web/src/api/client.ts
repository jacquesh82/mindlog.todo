import type { ApiKey, AskResult, AuthResult, Task, TaskHit, TaskStatus, User } from '../types';

const API: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const REFRESH_KEY = 'mindlog_refresh';

let accessToken: string | null = null;
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);
let listener: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function onAuthChange(fn: () => void): void {
  listener = fn;
}

export function setTokens(access: string | null, refresh: string | null): void {
  accessToken = access;
  refreshToken = refresh;
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  else localStorage.removeItem(REFRESH_KEY);
  listener?.();
}

export function hasRefreshToken(): boolean {
  return Boolean(refreshToken);
}

export function isAuthenticated(): boolean {
  return Boolean(accessToken);
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch(`${API}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    setTokens(null, null);
    return false;
  }
  const data = (await res.json()) as AuthResult;
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

async function request<T>(path: string, opts: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API}${path}`, { ...opts, headers });

  if (res.status === 401 && retry && refreshToken) {
    if (await tryRefresh()) return request<T>(path, opts, false);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(res.status, body.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  assignee?: string | null;
  dueDate?: string | null;
  status?: TaskStatus;
  progress?: number;
  parentId?: string | null;
}

export const api = {
  // auth
  async register(email: string, password: string, displayName?: string): Promise<AuthResult> {
    const r = await request<AuthResult>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
    setTokens(r.accessToken, r.refreshToken);
    return r;
  },
  async login(email: string, password: string): Promise<AuthResult> {
    const r = await request<AuthResult>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setTokens(r.accessToken, r.refreshToken);
    return r;
  },
  async logout(): Promise<void> {
    if (refreshToken) {
      await request('/api/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
    setTokens(null, null);
  },
  async restoreSession(): Promise<boolean> {
    return tryRefresh();
  },
  googleUrl(): string {
    return `${API}/api/v1/auth/google`;
  },
  me(): Promise<User> {
    return request<User>('/api/v1/me');
  },

  // tasks
  listTasks(params: Record<string, string> = {}): Promise<Task[]> {
    const qs = new URLSearchParams(params).toString();
    return request<Task[]>(`/api/v1/tasks${qs ? `?${qs}` : ''}`);
  },
  createTask(input: TaskInput): Promise<Task> {
    return request<Task>('/api/v1/tasks', { method: 'POST', body: JSON.stringify(input) });
  },
  updateTask(id: string, patch: Partial<TaskInput>): Promise<Task> {
    return request<Task>(`/api/v1/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteTask(id: string): Promise<void> {
    return request<void>(`/api/v1/tasks/${id}`, { method: 'DELETE' });
  },
  search(query: string, k = 10): Promise<TaskHit[]> {
    return request<TaskHit[]>('/api/v1/tasks/search', {
      method: 'POST',
      body: JSON.stringify({ query, k }),
    });
  },
  ask(question: string, k = 8): Promise<AskResult> {
    return request<AskResult>('/api/v1/tasks/ask', {
      method: 'POST',
      body: JSON.stringify({ question, k }),
    });
  },

  // api keys
  listApiKeys(): Promise<ApiKey[]> {
    return request<ApiKey[]>('/api/v1/api-keys');
  },
  createApiKey(name?: string): Promise<ApiKey> {
    return request<ApiKey>('/api/v1/api-keys', { method: 'POST', body: JSON.stringify({ name }) });
  },
  deleteApiKey(id: string): Promise<void> {
    return request<void>(`/api/v1/api-keys/${id}`, { method: 'DELETE' });
  },
};
