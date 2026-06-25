import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useDialog } from '../dialog';
import { useI18n } from '../i18n';
import type { Notebook, NotePage, NotePageSummary } from '../types';

// A OneNote-lite 3-pane workspace: notebooks | pages | editor.
export function NotesView() {
  const { t } = useI18n();
  const dialog = useDialog();
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
                className={`flex flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm ${activeNb === nb.id ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-line/60'}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: nb.color ?? '#808080' }} />
                <span className="flex-1 truncate">{nb.name}</span>
              </button>
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
            <div key={p.id} className="group flex items-center">
              <button
                onClick={() => void openPage(p.id)}
                className={`flex-1 truncate px-3 py-2 text-left text-sm ${page?.id === p.id ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-line/60'}`}
              >
                {p.title || t('notes.untitled')}
              </button>
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
          <div className="mx-auto max-w-3xl px-8 py-6">
            <input
              value={page.title}
              onChange={(e) => edit({ title: e.target.value })}
              placeholder={t('notes.untitled')}
              className="w-full border-b border-line pb-2 text-2xl font-bold text-ink outline-none"
            />
            <div className="mt-1 text-right text-xs text-muted">{saved ? t('notes.saved') : t('notes.saving')}</div>
            <textarea
              value={page.content}
              onChange={(e) => edit({ content: e.target.value })}
              placeholder={t('notes.placeholder')}
              className="mt-3 min-h-[60vh] w-full resize-none text-sm leading-relaxed text-ink outline-none"
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">{t('notes.empty')}</div>
        )}
      </div>
    </div>
  );
}
