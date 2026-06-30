import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useDialog } from '../dialog';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import { NotesDocument } from '../components/NotesDocument';
import type { Label, Notebook, NotePage, NotePageSummary, Project } from '../types';

// A OneNote-lite 3-pane workspace: notebooks | pages | editor.
export function NotesView({ initialPageId }: { initialPageId?: string }) {
  const { t } = useI18n();
  const dialog = useDialog();
  const { toast } = useToast();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNb, setActiveNb] = useState<string | null>(null);
  const [pages, setPages] = useState<NotePageSummary[]>([]);
  const [page, setPage] = useState<NotePage | null>(null);
  const [saved, setSaved] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [taskPreview, setTaskPreview] = useState<{ text: string; checked: boolean }[] | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Collapse the notebooks+pages columns into a thin vertical-tab rail to give
  // the editor more room. Choice is persisted across sessions.
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mindlog.notes.railCollapsed') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('mindlog.notes.railCollapsed', railCollapsed ? '1' : '0');
    } catch {
      /* ignore storage errors (private mode) */
    }
  }, [railCollapsed]);

  const reloadNotebooks = useCallback(() => {
    void api.listNotebooks().then((nbs) => {
      setNotebooks(nbs);
      setActiveNb((cur) => cur ?? nbs[0]?.id ?? null);
    });
  }, []);
  useEffect(reloadNotebooks, [reloadNotebooks]);

  // Projects & labels feed the #project / @label autocomplete in the editor.
  useEffect(() => {
    void api.listProjects().then(setProjects).catch(() => {});
    void api.listLabels().then(setLabels).catch(() => {});
  }, []);

  const reloadPages = useCallback((nbId: string) => {
    void api.listPages(nbId).then(setPages);
  }, []);
  useEffect(() => {
    if (activeNb) reloadPages(activeNb);
    else setPages([]);
  }, [activeNb, reloadPages]);

  // Deep-link: open a specific page when navigated to from the Search view.
  useEffect(() => {
    if (!initialPageId) return;
    void api
      .getPage(initialPageId)
      .then((p) => {
        setActiveNb(p.notebookId);
        setPage(p);
        setSaved(true);
      })
      .catch(() => {});
  }, [initialPageId]);

  async function addNotebook() {
    const name = await dialog.promptText({ title: t('notes.notebookName'), placeholder: t('notes.notebookName') });
    if (!name?.trim()) return;
    const nb = await api.createNotebook(name.trim(), '#246fe0');
    reloadNotebooks();
    setActiveNb(nb.id);
  }

  async function deleteNotebook(id: string) {
    if (!(await dialog.confirm({ title: t('notes.deleteNotebook'), danger: true }))) return;
    await api.deleteNotebook(id);
    if (activeNb === id) {
      setActiveNb(null);
      setPage(null);
    }
    reloadNotebooks();
  }

  async function addPage() {
    if (!activeNb) return;
    const p = await api.createPage(activeNb, t('notes.untitled'));
    reloadPages(activeNb);
    void openPage(p.id);
  }

  async function openPage(id: string) {
    const p = await api.getPage(id);
    setPage(p);
    setSaved(true);
  }

  async function deletePage(id: string) {
    if (!(await dialog.confirm({ title: t('common.deleteConfirm'), danger: true }))) return;
    await api.deletePage(id);
    if (page?.id === id) setPage(null);
    if (activeNb) reloadPages(activeNb);
  }

  async function duplicatePage(id: string) {
    const copy = await api.duplicatePage(id);
    if (activeNb) reloadPages(activeNb);
    void openPage(copy.id);
  }

  /** Reorder pages by drag-and-drop: move `draggedId` to `targetId`'s slot. */
  async function reorderPages(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const order = pages.map((p) => p.id);
    const from = order.indexOf(draggedId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, order.splice(from, 1)[0]!);
    const map = new Map(pages.map((p) => [p.id, p]));
    const next = order.map((id) => map.get(id)!);
    setPages(next); // optimistic
    await Promise.all(next.map((p, i) => (p.position === i ? null : api.updatePage(p.id, { position: i }))).filter(Boolean));
  }

  async function renameNotebook(nb: Notebook) {
    const name = await dialog.promptText({ title: t('notes.renameNotebook'), defaultValue: nb.name, placeholder: t('notes.notebookName') });
    if (name?.trim() && name.trim() !== nb.name) {
      await api.updateNotebook(nb.id, { name: name.trim() });
      reloadNotebooks();
    }
  }

  async function recolorNotebook(id: string, color: string) {
    await api.updateNotebook(id, { color });
    reloadNotebooks();
  }

  async function recolorPage(id: string, color: string) {
    await api.updatePage(id, { color });
    if (page?.id === id) setPage((p) => (p ? { ...p, color } : p));
    if (activeNb) reloadPages(activeNb);
  }

  async function addNotebookToRag(id: string) {
    const { updated } = await api.setNotebookRag(id, true);
    if (page?.notebookId === id) setPage((p) => (p ? { ...p, inRag: true } : p));
    toast(t('notes.ragNotebookDone', { count: updated }));
  }

  async function toggleRag() {
    if (!page) return;
    const updated = await api.updatePage(page.id, { inRag: !page.inRag });
    setPage((p) => (p ? { ...p, inRag: updated.inRag } : p));
    toast(updated.inRag ? t('notes.ragOn') : t('notes.ragOff'));
  }

  /**
   * Turn a note line into a real task via Quick Add (so #project / @label / p1 /
   * dates parse). Returns the created task so the editor can render it inline.
   */
  async function createTaskFromNote(text: string): Promise<{ id: string; title: string } | null> {
    try {
      const task = await api.quickAdd(text.slice(0, 500));
      toast(t('toast.taskCreated', { title: task.title }));
      return { id: task.id, title: task.title };
    } catch {
      toast(t('notes.taskFailed'), 'error');
      return null;
    }
  }

  /** AI: ask the model to extract tasks from the open page, then preview them. */
  async function convertPageToTasks() {
    if (!page || aiBusy) return;
    setAiBusy(true);
    try {
      const { tasks } = await api.extractPageTasks(page.id);
      setTaskPreview(tasks.map((text) => ({ text, checked: true })));
    } catch {
      toast(t('notes.aiFailed'), 'error');
    } finally {
      setAiBusy(false);
    }
  }

  /** Create the tasks the user kept ticked in the preview (via Quick Add parsing). */
  async function createPreviewedTasks() {
    const items = (taskPreview ?? []).filter((i) => i.checked && i.text.trim());
    setTaskPreview(null);
    let count = 0;
    for (const i of items) {
      try {
        await api.quickAdd(i.text.trim());
        count += 1;
      } catch {
        /* skip a line that fails to parse rather than aborting the batch */
      }
    }
    if (count) toast(t('notes.toTasksDone', { count }));
  }

  /** AI: summarize the active notebook into a new page, then open it. */
  async function runSummarize() {
    if (!activeNb || aiBusy) return;
    setAiBusy(true);
    try {
      const p = await api.summarizeNotebook(activeNb);
      reloadPages(activeNb);
      await openPage(p.id);
      toast(t('notes.summarizeDone'));
    } catch {
      toast(t('notes.aiFailed'), 'error');
    } finally {
      setAiBusy(false);
    }
  }

  // Debounced autosave of the open page.
  function edit(patch: { title?: string; content?: string }) {
    if (!page) return;
    const next = { ...page, ...patch };
    setPage(next);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.updatePage(next.id, { title: next.title, content: next.content });
        setSaved(true);
        if (activeNb) reloadPages(activeNb);
      } catch (e) {
        toast(
          e instanceof ApiError && e.status === 413
            ? t('notes.storageLimitReached')
            : t('notes.saveFailed'),
          'error',
        );
      }
    }, 600);
  }

  return (
    <div className="flex h-full">
      {railCollapsed && (
        /* Collapsed: notebooks and pages become two thin vertical-tab columns side by side. */
        <div className="flex shrink-0 border-r border-line bg-sidebar">
          {/* Notebooks column (with the expand chevron on top). */}
          <div className="flex w-11 flex-col items-center gap-1 py-2">
            <button
              onClick={() => setRailCollapsed(false)}
              title={t('notes.expandPanels')}
              aria-label={t('notes.expandPanels')}
              aria-expanded={false}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-line/60 hover:text-brand"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4l6 6-6 6" /></svg>
            </button>
            <div className="my-1 h-px w-6 bg-line" />
            <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
              {/* Notebooks: click to switch (the pages column refreshes), staying collapsed. */}
              {notebooks.map((nb) => (
                <button
                  key={nb.id}
                  onClick={() => setActiveNb(nb.id)}
                  title={nb.name}
                  aria-label={`${t('notes.selectNotebook')}: ${nb.name}`}
                  aria-pressed={activeNb === nb.id}
                  className={`flex flex-col items-center gap-2 rounded-md px-1.5 py-2 transition-colors ${activeNb === nb.id ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-line/60'}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: nb.color ?? '#808080' }} />
                  <span className="max-h-44 truncate text-sm" style={{ writingMode: 'vertical-rl' }}>{nb.name}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Pages column: pages of the active notebook; click to open without expanding. */}
          <div className="flex w-11 flex-col items-center gap-1 border-l border-line py-2">
            <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
              {pages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => void openPage(p.id)}
                  title={p.title || t('notes.untitled')}
                  aria-label={p.title || t('notes.untitled')}
                  aria-pressed={page?.id === p.id}
                  className={`flex flex-col items-center gap-2 rounded-md px-1.5 py-2 transition-colors ${page?.id === p.id ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-line/60'}`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full border border-line" style={{ backgroundColor: p.color ?? 'transparent' }} />
                  <span className="max-h-44 truncate text-sm" style={{ writingMode: 'vertical-rl' }}>{p.title || t('notes.untitled')}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {!railCollapsed && (
        <>
      {/* Notebooks pane */}
      <div className="flex w-48 shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase text-muted">
          {t('notes.notebooks')}
          <button onClick={addNotebook} className="hover:text-brand" title={t('notes.addNotebook')}>＋</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notebooks.map((nb) => (
            <div key={nb.id} className={`group flex items-center ${activeNb === nb.id ? 'bg-brand-soft' : 'hover:bg-line/60'}`}>
              <label className="cursor-pointer pl-3" title={t('notes.pickColor')}>
                <span className="block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: nb.color ?? '#808080' }} />
                <input type="color" className="sr-only" value={nb.color ?? '#808080'} onChange={(e) => void recolorNotebook(nb.id, e.target.value)} />
              </label>
              <button
                onClick={() => setActiveNb(nb.id)}
                onDoubleClick={() => void renameNotebook(nb)}
                title={t('notes.renameHint')}
                className={`flex-1 truncate px-2 py-1.5 text-left text-sm ${activeNb === nb.id ? 'font-medium text-brand' : 'text-ink'}`}
              >
                {nb.name}
              </button>
              <button onClick={() => void renameNotebook(nb)} title={t('notes.renameNotebook')} className="px-1 text-muted opacity-0 hover:text-brand group-hover:opacity-100">✏️</button>
              <button onClick={() => void addNotebookToRag(nb.id)} title={t('notes.ragNotebook')} className="px-1 text-muted opacity-0 hover:text-brand group-hover:opacity-100">🧠</button>
              <button onClick={() => void deleteNotebook(nb.id)} className="px-1 text-muted opacity-0 hover:text-[var(--color-p1)] group-hover:opacity-100">🗑</button>
            </div>
          ))}
          {notebooks.length === 0 && (
            <button onClick={addNotebook} className="px-3 py-2 text-sm text-muted hover:text-brand">＋ {t('notes.addNotebook')}</button>
          )}
        </div>
      </div>

      {/* Pages pane */}
      <div className="flex w-60 shrink-0 flex-col border-r border-line">
        <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase text-muted">
          {t('notes.pages')}
          {activeNb && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void runSummarize()}
                disabled={aiBusy || pages.length === 0}
                className="hover:text-brand disabled:opacity-40"
                title={t('notes.summarizeHint')}
              >
                ✨
              </button>
              <button onClick={addPage} className="hover:text-brand" title={t('notes.addPage')}>＋</button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {pages.map((p) => (
            <div
              key={p.id}
              className="group flex cursor-grab items-center active:cursor-grabbing"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/page', p.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/page');
                if (id) void reorderPages(id, p.id);
              }}
            >
              <span className="pl-1 text-muted opacity-0 group-hover:opacity-100" title={t('notes.dragPage')}>⠿</span>
              <label className="cursor-pointer px-1" title={t('notes.pickColor')}>
                <span className="block h-2 w-2 rounded-full border border-line" style={{ backgroundColor: p.color ?? 'transparent' }} />
                <input type="color" className="sr-only" value={p.color ?? '#cccccc'} onChange={(e) => void recolorPage(p.id, e.target.value)} />
              </label>
              <button
                onClick={() => void openPage(p.id)}
                className={`flex-1 truncate px-1 py-2 text-left text-sm ${page?.id === p.id ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-line/60'}`}
                style={p.color ? { borderLeft: `3px solid ${p.color}` } : undefined}
              >
                {p.title || t('notes.untitled')}
              </button>
              <button onClick={() => void duplicatePage(p.id)} title={t('notes.duplicate')} className="px-1 text-muted opacity-0 hover:text-brand group-hover:opacity-100">⧉</button>
              <button onClick={() => void deletePage(p.id)} className="px-1 text-muted opacity-0 hover:text-[var(--color-p1)] group-hover:opacity-100">🗑</button>
            </div>
          ))}
          {activeNb && pages.length === 0 && (
            <button onClick={addPage} className="px-3 py-2 text-sm text-muted hover:text-brand">＋ {t('notes.addPage')}</button>
          )}
        </div>
      </div>

      {/* Collapse handle sitting on the border between the page list and the editor. */}
      <button
        onClick={() => setRailCollapsed(true)}
        title={t('notes.collapsePanels')}
        aria-label={t('notes.collapsePanels')}
        aria-expanded={true}
        className="group flex w-3 shrink-0 cursor-pointer items-center justify-center border-r border-line bg-sidebar transition-colors hover:bg-brand-soft"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-muted transition-colors group-hover:text-brand" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4l-6 6 6 6" /></svg>
      </button>
        </>
      )}

      {/* Editor pane */}
      <div className="flex-1 overflow-y-auto">
        {page ? (
          <div className="mx-auto max-w-4xl px-8 py-6">
            <input
              value={page.title}
              onChange={(e) => edit({ title: e.target.value })}
              placeholder={t('notes.untitled')}
              className="w-full border-b border-line pb-2 text-2xl font-bold text-ink outline-none"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-muted">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void toggleRag()}
                  title={t('notes.ragHint')}
                  className={`rounded-md border px-2 py-0.5 ${page.inRag ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:text-ink'}`}
                >
                  {page.inRag ? `🧠 ${t('notes.ragOnLabel')}` : `🧠 ${t('notes.ragAdd')}`}
                </button>
                {!page.inRag && (
                  <span
                    title={t('notes.ragOffNotice')}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-400/60 bg-amber-50 px-2 py-0.5 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400"
                  >
                    ⚠️ {t('notes.ragOffBadge')}
                  </span>
                )}
                <button
                  onClick={() => void convertPageToTasks()}
                  disabled={aiBusy}
                  title={t('notes.toTasksHint')}
                  className="rounded-md border border-line px-2 py-0.5 text-muted hover:text-ink disabled:opacity-40"
                >
                  {aiBusy ? `⏳ ${t('notes.toTasks')}` : `✓ ${t('notes.toTasks')}`}
                </button>
              </div>
              <span>{saved ? t('notes.saved') : t('notes.saving')}</span>
            </div>
            <NotesDocument
              key={page.id}
              pageId={page.id}
              initialContent={page.content}
              onChange={(content) => edit({ content })}
              onCreateTask={createTaskFromNote}
              projects={projects}
              labels={labels}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">{t('notes.empty')}</div>
        )}
      </div>

      {/* Convert-to-tasks preview: tick the tasks to create (lands in the Inbox). */}
      {taskPreview && (
        <div
          className="fixed inset-0 z-[1100] flex items-start justify-center bg-black/40 p-4 pt-24"
          onClick={() => setTaskPreview(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-ink">{t('notes.toTasksTitle')}</h2>
            {taskPreview.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t('notes.toTasksEmpty')}</p>
            ) : (
              <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                {taskPreview.map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) =>
                        setTaskPreview((prev) => prev?.map((p, j) => (j === i ? { ...p, checked: e.target.checked } : p)) ?? prev)
                      }
                      className="accent-brand"
                    />
                    <input
                      value={item.text}
                      onChange={(e) =>
                        setTaskPreview((prev) => prev?.map((p, j) => (j === i ? { ...p, text: e.target.value } : p)) ?? prev)
                      }
                      className="flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-brand"
                    />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setTaskPreview(null)} className="rounded-md px-3 py-1.5 text-sm text-ink hover:bg-line/60">
                {t('task.cancel')}
              </button>
              <button
                onClick={() => void createPreviewedTasks()}
                disabled={!taskPreview.some((i) => i.checked && i.text.trim())}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {t('notes.toTasksCreate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
