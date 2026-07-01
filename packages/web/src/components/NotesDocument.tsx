import { Suspense, lazy, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { useIsDesktop } from '../useIsDesktop';
import { parsePageContent, serializePageContent, type PageMode } from '../notes/content';
import { NotesEditor } from './NotesEditor';
import type { RawViewMode } from './NotesRawEditor';
import type { Label, Project } from '../types';

// The raw editor pulls in CodeMirror + markdown-it; load it on demand so the
// heavy deps only ship when a page is actually switched to raw-text mode.
const NotesRawEditor = lazy(() =>
  import('./NotesRawEditor').then((m) => ({ default: m.NotesRawEditor })),
);

// Page document host: switches a page between the floating-block canvas and the
// raw CommonMark editor. Both representations are kept in the page content, so
// toggling modes is non-destructive.

interface Props {
  pageId: string;
  initialContent: string;
  onChange: (content: string) => void;
  onCreateTask: (text: string) => Promise<{ id: string; title: string } | null>;
  projects: Project[];
  labels: Label[];
}

export function NotesDocument({ pageId, initialContent, onChange, onCreateTask, projects, labels }: Props) {
  const { t } = useI18n();
  const init = useRef(parsePageContent(initialContent)).current;
  const [mode, setMode] = useState<PageMode>(init.mode);
  const [blocksContent, setBlocksContent] = useState(init.blocksContent);
  const [markdown, setMarkdown] = useState(init.markdown);
  const [viewMode, setViewMode] = useState<RawViewMode>('split');
  const [splitDir, setSplitDir] = useState<'h' | 'v'>('h');
  const isDesktop = useIsDesktop();
  // Split view is too cramped on phones, so it (and the orientation toggle) are
  // desktop-only; a phone falls back to the single-pane Editor.
  const rawViews = isDesktop ? (['edit', 'split', 'preview'] as const) : (['edit', 'preview'] as const);
  const effViewMode: RawViewMode = viewMode === 'split' && !isDesktop ? 'edit' : viewMode;

  function onBlocks(c: string) {
    setBlocksContent(c);
    onChange(serializePageContent(mode, c, markdown));
  }
  function onMd(md: string) {
    setMarkdown(md);
    onChange(serializePageContent(mode, blocksContent, md));
  }
  function switchMode(m: PageMode) {
    if (m === mode) return;
    setMode(m);
    onChange(serializePageContent(m, blocksContent, markdown));
  }

  const seg = (on: boolean) =>
    `px-2 py-1 ${on ? 'bg-brand text-white' : 'text-ink hover:bg-line/60'}`;
  const segSoft = (on: boolean) =>
    `px-2 py-1 ${on ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-line/60'}`;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <div className="inline-flex overflow-hidden rounded-md border border-line">
          <button onClick={() => switchMode('blocks')} className={seg(mode === 'blocks')}>{t('notes.modeBlocks')}</button>
          <button onClick={() => switchMode('raw')} className={seg(mode === 'raw')}>{t('notes.modeRaw')}</button>
        </div>

        {mode === 'raw' && (
          <>
            <div className="inline-flex overflow-hidden rounded-md border border-line">
              {rawViews.map((v) => (
                <button key={v} onClick={() => setViewMode(v)} className={segSoft(effViewMode === v)}>{t(`notes.view.${v}`)}</button>
              ))}
            </div>
            {effViewMode === 'split' && (
              <button
                onClick={() => setSplitDir((d) => (d === 'h' ? 'v' : 'h'))}
                className="rounded-md border border-line px-2 py-1 text-ink hover:bg-line/60"
                title={t('notes.splitToggle')}
              >
                {splitDir === 'h' ? '▥' : '▤'} {t('notes.splitToggle')}
              </button>
            )}
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {mode === 'blocks' ? (
          <NotesEditor
            key={`${pageId}:blocks`}
            initialContent={blocksContent}
            onChange={onBlocks}
            onCreateTask={onCreateTask}
            projects={projects}
            labels={labels}
          />
        ) : (
          <Suspense fallback={<div className="p-4 text-sm text-muted">{t('common.loading')}</div>}>
            <NotesRawEditor key={`${pageId}:raw`} markdown={markdown} onChange={onMd} viewMode={effViewMode} splitDir={splitDir} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
