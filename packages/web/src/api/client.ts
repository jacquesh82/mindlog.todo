import type {
  AiLog,
  AiSettings,
  AiUsage,
  ApiKey,
  Attachment,
  CalendarSource,
  ExternalEvent,
  Notebook,
  NotePage,
  NotePageSummary,
  AskResult,
  AuthResult,
  DashboardStats,
  Filter,
  Karma,
  Label,
  Project,
  ProjectViewMode,
  QuickAddPreview,
  Section,
  Task,
  TaskHit,
  TaskStatus,
  User,
} from '../types';

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
  deadline?: string | null;
  durationMinutes?: number | null;
  recurrence?: string | null;
  status?: TaskStatus;
  priority?: number;
  progress?: number;
  parentId?: string | null;
  projectId?: string | null;
  sectionId?: string | null;
  labelIds?: string[];
}

export interface ProjectInput {
  name: string;
  color?: string | null;
  parentId?: string | null;
  isFavorite?: boolean;
  viewMode?: ProjectViewMode;
  position?: number;
  archived?: boolean;
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
  mindlogIdUrl(): string {
    return `${API}/api/v1/auth/mindlog-id`;
  },
  /** Finish a mindlog-id sign-in when the IdP returned no email (user typed one). */
  async completeMindlogId(pendingToken: string, email: string): Promise<AuthResult> {
    const r = await request<AuthResult>('/api/v1/auth/mindlog-id/complete', {
      method: 'POST',
      body: JSON.stringify({ pendingToken, email }),
    });
    setTokens(r.accessToken, r.refreshToken);
    return r;
  },
  async forgotPassword(email: string): Promise<void> {
    await request('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  async resetPassword(token: string, password: string): Promise<void> {
    await request('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },
  /** Absolute URL of the remote MCP server (for the Claude custom connector). */
  mcpUrl(): string {
    // VITE_API_URL may be empty (same origin) or a path prefix like "/app".
    // Always return an ABSOLUTE url so it can be pasted into Claude as-is.
    const base = /^https?:\/\//.test(API) ? API : `${window.location.origin}${API}`;
    return `${base.replace(/\/$/, '')}/mcp`;
  },
  /** Pre-register a confidential OAuth client for the Claude connector. */
  createMcpOAuthClient(): Promise<{
    client_id: string;
    client_secret?: string;
    redirect_uris: string[];
  }> {
    return request('/api/v1/oauth/clients', { method: 'POST' });
  },
  /** Approve or deny an OAuth authorization request; returns the redirect URL. */
  authorizeConsent(
    params: Record<string, string>,
    approve: boolean,
  ): Promise<{ redirectTo: string }> {
    return request<{ redirectTo: string }>('/api/v1/oauth/authorize', {
      method: 'POST',
      body: JSON.stringify({ ...params, approve }),
    });
  },
  me(): Promise<User> {
    return request<User>('/api/v1/me');
  },
  updateProfile(patch: { displayName?: string | null; avatarUrl?: string | null }): Promise<User> {
    return request<User>('/api/v1/me', { method: 'PATCH', body: JSON.stringify(patch) });
  },

  // AI configuration (model + own key in self-hosted; credits in cloud-hosted)
  getAiSettings(): Promise<AiSettings> {
    return request<AiSettings>('/api/v1/ai/settings');
  },
  updateAiSettings(patch: { provider?: string; model?: string; apiKey?: string }): Promise<AiSettings> {
    return request<AiSettings>('/api/v1/ai/settings', { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteAiKey(): Promise<AiSettings> {
    return request<AiSettings>('/api/v1/ai/settings/key', { method: 'DELETE' });
  },
  /** Live model list from a provider (uses supplied or stored key). */
  aiProviderModels(provider: string, apiKey?: string): Promise<{ models: string[] }> {
    return request<{ models: string[] }>('/api/v1/ai/models', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey }),
    });
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
  quickAdd(text: string): Promise<Task> {
    // Send the local tz offset (minutes east of UTC) so "9h" parses in local time.
    const tz = -new Date().getTimezoneOffset();
    return request<Task>('/api/v1/tasks/quickadd', {
      method: 'POST',
      body: JSON.stringify({ text, tz }),
    });
  },
  parseQuickAdd(text: string): Promise<QuickAddPreview> {
    const tz = -new Date().getTimezoneOffset();
    return request<QuickAddPreview>('/api/v1/tasks/parse', {
      method: 'POST',
      body: JSON.stringify({ text, tz }),
    });
  },
  runQuery(q: string): Promise<Task[]> {
    return request<Task[]>(`/api/v1/tasks/query?q=${encodeURIComponent(q)}`);
  },
  search(query: string, k = 10): Promise<TaskHit[]> {
    return request<TaskHit[]>('/api/v1/tasks/search', {
      method: 'POST',
      body: JSON.stringify({ query, k }),
    });
  },

  // calendar sources (iCal / Google subscription feeds)
  listCalendarSources(): Promise<CalendarSource[]> {
    return request<CalendarSource[]>('/api/v1/calendar/sources');
  },
  createCalendarSource(input: { name: string; url: string; color?: string | null }): Promise<CalendarSource> {
    return request<CalendarSource>('/api/v1/calendar/sources', { method: 'POST', body: JSON.stringify(input) });
  },
  deleteCalendarSource(id: string): Promise<void> {
    return request<void>(`/api/v1/calendar/sources/${id}`, { method: 'DELETE' });
  },
  calendarEvents(): Promise<ExternalEvent[]> {
    return request<ExternalEvent[]>('/api/v1/calendar/events');
  },
  // mindlog id agenda connection (read-only calendar from the central identity)
  mindlogIdCalendarStatus(): Promise<{ connected: boolean; agendaGranted: boolean }> {
    return request<{ connected: boolean; agendaGranted: boolean }>('/api/v1/calendar/mindlog-id');
  },
  disconnectMindlogIdCalendar(): Promise<void> {
    return request<void>('/api/v1/calendar/mindlog-id', { method: 'DELETE' });
  },

  // notes (OneNote-lite)
  listNotebooks(): Promise<Notebook[]> {
    return request<Notebook[]>('/api/v1/notes/notebooks');
  },
  createNotebook(name: string, color?: string | null): Promise<Notebook> {
    return request<Notebook>('/api/v1/notes/notebooks', { method: 'POST', body: JSON.stringify({ name, color }) });
  },
  updateNotebook(id: string, patch: { name?: string; color?: string | null }): Promise<Notebook> {
    return request<Notebook>(`/api/v1/notes/notebooks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteNotebook(id: string): Promise<void> {
    return request<void>(`/api/v1/notes/notebooks/${id}`, { method: 'DELETE' });
  },
  listPages(notebookId: string): Promise<NotePageSummary[]> {
    return request<NotePageSummary[]>(`/api/v1/notes/notebooks/${notebookId}/pages`);
  },
  createPage(notebookId: string, title?: string): Promise<NotePage> {
    return request<NotePage>(`/api/v1/notes/notebooks/${notebookId}/pages`, { method: 'POST', body: JSON.stringify({ title }) });
  },
  getPage(id: string): Promise<NotePage> {
    return request<NotePage>(`/api/v1/notes/pages/${id}`);
  },
  updatePage(id: string, patch: { title?: string; content?: string; position?: number; inRag?: boolean; color?: string | null }): Promise<NotePage> {
    return request<NotePage>(`/api/v1/notes/pages/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deletePage(id: string): Promise<void> {
    return request<void>(`/api/v1/notes/pages/${id}`, { method: 'DELETE' });
  },
  duplicatePage(id: string): Promise<NotePage> {
    return request<NotePage>(`/api/v1/notes/pages/${id}/duplicate`, { method: 'POST' });
  },
  setNotebookRag(notebookId: string, inRag: boolean): Promise<{ updated: number }> {
    return request<{ updated: number }>(`/api/v1/notes/notebooks/${notebookId}/rag`, {
      method: 'POST',
      body: JSON.stringify({ inRag }),
    });
  },

  // attachments (feed the RAG)
  listAttachments(taskId: string): Promise<Attachment[]> {
    return request<Attachment[]>(`/api/v1/tasks/${taskId}/attachments`);
  },
  addAttachment(taskId: string, a: { filename: string; mime?: string; content: string }): Promise<Attachment> {
    return request<Attachment>(`/api/v1/tasks/${taskId}/attachments`, { method: 'POST', body: JSON.stringify(a) });
  },
  deleteAttachment(id: string): Promise<void> {
    return request<void>(`/api/v1/attachments/${id}`, { method: 'DELETE' });
  },

  // projects
  listProjects(includeArchived = false): Promise<Project[]> {
    return request<Project[]>(`/api/v1/projects${includeArchived ? '?includeArchived=true' : ''}`);
  },
  createProject(input: ProjectInput): Promise<Project> {
    return request<Project>('/api/v1/projects', { method: 'POST', body: JSON.stringify(input) });
  },
  updateProject(id: string, patch: Partial<ProjectInput>): Promise<Project> {
    return request<Project>(`/api/v1/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteProject(id: string): Promise<void> {
    return request<void>(`/api/v1/projects/${id}`, { method: 'DELETE' });
  },

  // sections
  listSections(projectId: string): Promise<Section[]> {
    return request<Section[]>(`/api/v1/sections?projectId=${projectId}`);
  },
  createSection(projectId: string, name: string, position?: number): Promise<Section> {
    return request<Section>('/api/v1/sections', {
      method: 'POST',
      body: JSON.stringify({ projectId, name, position }),
    });
  },
  updateSection(id: string, patch: { name?: string; position?: number }): Promise<Section> {
    return request<Section>(`/api/v1/sections/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteSection(id: string): Promise<void> {
    return request<void>(`/api/v1/sections/${id}`, { method: 'DELETE' });
  },

  // labels
  listLabels(): Promise<Label[]> {
    return request<Label[]>('/api/v1/labels');
  },
  createLabel(name: string, color?: string | null, isFavorite?: boolean): Promise<Label> {
    return request<Label>('/api/v1/labels', { method: 'POST', body: JSON.stringify({ name, color, isFavorite }) });
  },
  updateLabel(id: string, patch: { name?: string; color?: string | null; isFavorite?: boolean }): Promise<Label> {
    return request<Label>(`/api/v1/labels/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteLabel(id: string): Promise<void> {
    return request<void>(`/api/v1/labels/${id}`, { method: 'DELETE' });
  },

  // filters
  listFilters(): Promise<Filter[]> {
    return request<Filter[]>('/api/v1/filters');
  },
  createFilter(input: { name: string; query: string; color?: string | null }): Promise<Filter> {
    return request<Filter>('/api/v1/filters', { method: 'POST', body: JSON.stringify(input) });
  },
  updateFilter(id: string, patch: { name?: string; query?: string; color?: string | null }): Promise<Filter> {
    return request<Filter>(`/api/v1/filters/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteFilter(id: string): Promise<void> {
    return request<void>(`/api/v1/filters/${id}`, { method: 'DELETE' });
  },
  runFilter(id: string): Promise<Task[]> {
    return request<Task[]>(`/api/v1/filters/${id}/tasks`);
  },
  ask(question: string, k = 8, notebookIds?: string[]): Promise<AskResult> {
    return request<AskResult>('/api/v1/tasks/ask', {
      method: 'POST',
      body: JSON.stringify({ question, k, notebookIds }),
    });
  },

  // karma
  getKarma(): Promise<Karma> {
    return request<Karma>('/api/v1/karma');
  },

  // dashboard KPIs
  dashboard(): Promise<DashboardStats> {
    return request<DashboardStats>('/api/v1/dashboard');
  },

  // deployed version (Settings → About)
  version(): Promise<{ version: string; buildDate: string }> {
    return request<{ version: string; buildDate: string }>('/api/v1/version');
  },

  // AI activity
  aiUsage(): Promise<AiUsage> {
    return request<AiUsage>('/api/v1/ai/usage');
  },
  aiLogs(limit = 50): Promise<AiLog[]> {
    return request<AiLog[]>(`/api/v1/ai/logs?limit=${limit}`);
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

  // full data export (backup / portability)
  exportData(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('/api/v1/export');
  },
};
