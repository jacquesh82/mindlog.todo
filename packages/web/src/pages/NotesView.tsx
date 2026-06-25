import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useDialog } from '../dialog';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import { NotesEditor } from '../components/NotesEditor';
import type { Notebook, NotePage, NotePageSummary } from '../types';

// A OneNote-lite 3-pane workspace: notebooks | pages | editor.
export function NotesView() {
  const { t } = useI18n();
  const dialog = useDialog();
  const { toast } = useToast();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNb, setActiveNb] = useState<string | null>(null);
  const [pages, setPages] = useState<NotePageSummary[]>([]);
  const [page, setPage] = useState<NotePage | null>(null);
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reloadNotebooks = useCallback(() => {
    void api.listNotebooks().then((nbs) => {
      setNotebooks(nbs);
      setActiveNb((cur) => cur ?? nbs[0]?.id ?? null);
    });
  }, []);
  useEffect(reloadNotebooks, [reloadNotebooks]);

  const reloadPages = useCallback((nbId: string) => {
    void api.listPages(nbId).then(setPages);
  }, []);
  useEffect(() => {
    if (activeNb) reloadPages(activeNb);
    else setPages([]);
  }, [activeNb, reloadPages]);

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

  /** Turn a note line into a real task (lands in the Inbox / normal task lists). */
  async function createTaskFromNote(text: string) {
    const task = await api.createTask({ title: text.slice(0, 500) });
    toast(t('toast.taskCreated', { title: task.title }));
  }

  // Debounced autosave of the open page.
  function edit(patch: { title?: string; content?: string }) {
    if (!page) return;
    const next = { ...page, ...patch };
    setPage(next);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await api.updatePage(next.id, { title: next.title, content: next.content });
      setSaved(true);
      if (activeNb) reloadPages(activeNb);
    }, 600);
  }

  return (
    <div className="flex h-full">
      {/* Notebooks pane */}
      <div className="flex w-48 shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase text-muted">
          {t('notes.notebooks')}
          <button onClick={addNotebook} className="hover:text-brand" title={t('notes.addNotebook')}>＋</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notebooks.map((nb) => (
            <div key={nb.id} className="group flex items-center">
              <button
                onClick={() => setActiveNb(nb.id)}
                onDoubleClick={() => void renameNotebook(nb)}
                title={t('notes.renameHint')}
                className={`flex flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm ${activeNb === nb.id ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-line/60'}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: nb.color ?? '#808080' }} />
                <span className="flex-1 truncate">{nb.name}</span>
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
          {activeNb && <button onClick={addPage} className="hover:text-brand" title={t('notes.addPage')}>＋</button>}
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
              <button
                onClick={() => void openPage(p.id)}
                className={`flex-1 truncate px-2 py-2 text-left text-sm ${page?.id === p.id ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-line/60'}`}
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
              <button
                onClick={() => void toggleRag()}
                title={t('notes.ragHint')}
                className={`rounded-md border px-2 py-0.5 ${page.inRag ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:text-ink'}`}
              >
                {page.inRag ? `🧠 ${t('notes.ragOnLabel')}` : `🧠 ${t('notes.ragAdd')}`}
              </button>
              <span>{saved ? t('notes.saved') : t('notes.saving')}</span>
            </div>
            <NotesEditor
              key={page.id}
              initialContent={page.content}
              onChange={(content) => edit({ content })}
              onCreateTask={createTaskFromNote}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">{t('notes.empty')}</div>
        )}
      </div>
    </div>
  );
}
