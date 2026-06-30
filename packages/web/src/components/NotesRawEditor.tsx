import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  bracketMatching,
  codeFolding,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  foldService,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { renderMarkdown } from '../notes/markdown';
import '../notes/github-markdown.css';

export type RawViewMode = 'edit' | 'preview' | 'split';

// Fold an ATX heading (`#`, `##`, `###`, …) from its end down to the line before
// the next heading of the same or a higher level — so #, ##, ### are collapsible.
const headingFold = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  const m = /^(#{1,6})\s/.exec(line.text);
  if (!m) return null;
  const level = m[1]!.length;
  let end = line.to;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const l = state.doc.line(n);
    const hm = /^(#{1,6})\s/.exec(l.text);
    if (hm && hm[1]!.length <= level) break;
    end = l.to;
  }
  return end > line.to ? { from: line.to, to: end } : null;
});

interface Props {
  markdown: string;
  onChange: (md: string) => void;
  viewMode: RawViewMode;
  splitDir: 'h' | 'v';
}

export function NotesRawEditor({ markdown: initialMd, onChange, viewMode, splitDir }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced preview render keeps long documents responsive while typing.
  function schedulePreview(src: string) {
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(() => {
      if (previewRef.current) previewRef.current.innerHTML = renderMarkdown(src);
    }, 150);
  }

  // Build the editor once; it stays uncontrolled (external value only seeds it)
  // so the cursor is never reset on keystrokes. CodeMirror virtualizes the
  // document, so very long notes stay smooth.
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialMd,
        extensions: [
          history(),
          lineNumbers(),
          highlightActiveLine(),
          indentOnInput(),
          bracketMatching(),
          codeFolding(),
          foldGutter(),
          headingFold,
          markdown(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            const text = u.state.doc.toString();
            onChangeRef.current(text);
            schedulePreview(text);
          }),
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '13px' },
            '.cm-content': { paddingBlock: '8px' },
          }),
        ],
      }),
    });
    schedulePreview(initialMd);
    return () => {
      view.destroy();
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editorVisible = viewMode !== 'preview';
  const previewVisible = viewMode !== 'edit';

  return (
    <div className={`flex ${splitDir === 'v' ? 'flex-col' : 'flex-row'} h-[72vh] min-h-[420px] gap-2`}>
      <div
        ref={hostRef}
        className={`min-h-0 overflow-hidden rounded-md border border-line ${editorVisible ? 'flex-1' : 'hidden'}`}
      />
      <div
        ref={previewRef}
        className={`markdown-body min-h-0 overflow-auto rounded-md border border-line p-4 ${previewVisible ? 'flex-1' : 'hidden'}`}
      />
    </div>
  );
}
