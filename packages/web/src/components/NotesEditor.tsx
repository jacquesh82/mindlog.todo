import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

// A OneNote-style page canvas: double-click empty space to drop a movable text
// box; each box is rich-text editable (bold / italic / underline / lists /
// highlight) and can spawn a real task from its text.

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  html: string;
}

const rid = () => Math.random().toString(36).slice(2, 10);

function parseBoxes(content: string): Box[] {
  try {
    const j = JSON.parse(content);
    if (j && Array.isArray(j.boxes)) return j.boxes as Box[];
  } catch {
    /* legacy plain text → one box */
  }
  if (content.trim()) {
    const html = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    return [{ id: rid(), x: 16, y: 16, w: 420, html }];
  }
  return [];
}

const HIGHLIGHTS = ['#fff3a3', '#bde7c5', '#bcd9ff', '#ffc9d4', 'transparent'];

interface Props {
  initialContent: string;
  onChange: (content: string) => void;
  onCreateTask: (text: string) => void;
}

export function NotesEditor({ initialContent, onChange, onCreateTask }: Props) {
  const { t } = useI18n();
  const [boxes, setBoxes] = useState<Box[]>(() => parseBoxes(initialContent));
  const [active, setActive] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const rez = useRef<{ id: string; startW: number; startX: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Persist (debounced) whenever boxes change.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = (next: Box[]) => {
    setBoxes(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onChange(JSON.stringify({ boxes: next })), 500);
  };

  function addBoxAt(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const box: Box = { id: rid(), x: clientX - rect.left, y: clientY - rect.top, w: 360, html: '' };
    commit([...boxes, box]);
    setActive(box.id);
    requestAnimationFrame(() => document.getElementById(`box-${box.id}`)?.focus());
  }

  // Drag handling.
  useEffect(() => {
    if (!active) return;
    const onMove = (e: MouseEvent) => {
      if (rez.current) {
        const id = rez.current.id;
        const w = Math.max(120, rez.current.startW + (e.clientX - rez.current.startX));
        setBoxes((bs) => bs.map((b) => (b.id === id ? { ...b, w } : b)));
        return;
      }
      if (!drag.current) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const id = drag.current.id;
      setBoxes((bs) =>
        bs.map((b) => (b.id === id ? { ...b, x: Math.max(0, e.clientX - rect.left - drag.current!.dx), y: Math.max(0, e.clientY - rect.top - drag.current!.dy) } : b)),
      );
    };
    const onUp = () => {
      if (drag.current || rez.current) {
        drag.current = null;
        rez.current = null;
        // persist the new position / size
        setBoxes((bs) => {
          onChange(JSON.stringify({ boxes: bs }));
          return bs;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [active, onChange]);

  function exec(cmd: string, value?: string) {
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(cmd, false, value);
  }

  function insertTable(rows = 3, cols = 3) {
    const cell = '<td style="border:1px solid var(--color-line);padding:4px 8px;min-width:52px">&nbsp;</td>';
    const row = `<tr>${cell.repeat(cols)}</tr>`;
    const html = `<table style="border-collapse:collapse;margin:6px 0">${row.repeat(rows)}</table><div><br></div>`;
    document.execCommand('insertHTML', false, html);
  }

  function updateHtml(id: string, html: string) {
    commit(boxes.map((b) => (b.id === id ? { ...b, html } : b)));
  }

  // Paste an image from the clipboard as an inline image block.
  function onPaste(id: string, e: React.ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => {
      // Wrap in a horizontally-resizable span so the image gets a drag grip.
      document.execCommand(
        'insertHTML',
        false,
        `<span style="display:inline-block;overflow:hidden;resize:horizontal;max-width:100%;width:320px;margin:6px 0;border-radius:6px" contenteditable="false"><img src="${reader.result}" style="width:100%;display:block"/></span><div><br></div>`,
      );
      const el = document.getElementById(`box-${id}`);
      if (el) updateHtml(id, el.innerHTML);
    };
    reader.readAsDataURL(file);
  }

  function removeBox(id: string) {
    commit(boxes.filter((b) => b.id !== id));
    setActive(null);
  }

  function createTask(id: string) {
    const el = document.getElementById(`box-${id}`);
    const text = el?.textContent?.trim();
    if (text) onCreateTask(text);
  }

  return (
    <div
      ref={canvasRef}
      onDoubleClick={(e) => {
        if (e.target === canvasRef.current) addBoxAt(e.clientX, e.clientY);
      }}
      className="relative min-h-[70vh] w-full"
      title={t('notes.canvasHint')}
    >
      {boxes.length === 0 && (
        <p className="pointer-events-none absolute left-4 top-4 text-sm text-muted">{t('notes.canvasHint')}</p>
      )}
      {boxes.map((b) => (
        <div
          key={b.id}
          className={`absolute rounded-md border ${active === b.id ? 'border-brand shadow-sm' : 'border-transparent hover:border-line'}`}
          style={{ left: b.x, top: b.y, width: b.w }}
          onMouseDown={() => setActive(b.id)}
        >
          {active === b.id && (
            <div className="absolute -top-9 left-0 flex items-center gap-0.5 rounded-md border border-line bg-surface px-1 py-0.5 text-sm shadow"
              onMouseDown={(e) => e.preventDefault()}>
              <Tb onClick={() => exec('bold')} label="B" className="font-bold" />
              <Tb onClick={() => exec('italic')} label="I" className="italic" />
              <Tb onClick={() => exec('underline')} label="U" className="underline" />
              <span className="mx-0.5 text-line">|</span>
              <Tb onClick={() => exec('insertUnorderedList')} label="•" />
              <Tb onClick={() => exec('insertOrderedList')} label="1." />
              <Tb onClick={() => insertTable()} label="⊞" />
              <span className="mx-0.5 text-line">|</span>
              {HIGHLIGHTS.map((c) => (
                <button key={c} onClick={() => exec('hiliteColor', c)} title={t('notes.highlight')}
                  className="h-4 w-4 rounded-sm border border-line" style={{ backgroundColor: c === 'transparent' ? undefined : c }}>
                  {c === 'transparent' ? '⌀' : ''}
                </button>
              ))}
              <span className="mx-0.5 text-line">|</span>
              <button onClick={() => createTask(b.id)} className="rounded px-1.5 text-xs text-brand hover:bg-brand-soft" title={t('notes.createTask')}>✓ {t('notes.task')}</button>
              <button
                onMouseDown={(e) => { e.preventDefault(); drag.current = { id: b.id, dx: 0, dy: 0 }; }}
                className="cursor-move px-1 text-muted"
                title={t('notes.move')}
              >✥</button>
              <button onClick={() => removeBox(b.id)} className="px-1 text-muted hover:text-[var(--color-p1)]">🗑</button>
            </div>
          )}
          <EditableContent
            box={b}
            onFocus={() => setActive(b.id)}
            onPaste={(e) => onPaste(b.id, e)}
            onChange={(html) => updateHtml(b.id, html)}
          />
          {active === b.id && (
            <div
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); rez.current = { id: b.id, startW: b.w, startX: e.clientX }; }}
              title={t('notes.resize')}
              className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-brand bg-surface"
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Uncontrolled rich-text box: innerHTML is set once on mount, never re-applied
 * from React, so typing and selection are never disrupted (a controlled
 * dangerouslySetInnerHTML resets the caret to the start on every keystroke).
 */
function EditableContent({
  box,
  onFocus,
  onPaste,
  onChange,
}: {
  box: Box;
  onFocus: () => void;
  onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = box.html;
    // mount only — intentionally not reacting to box.html changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sync = () => onChange(ref.current?.innerHTML ?? '');
  return (
    <div
      ref={ref}
      id={`box-${box.id}`}
      contentEditable
      suppressContentEditableWarning
      onFocus={onFocus}
      onPaste={onPaste}
      onInput={sync}
      onMouseUp={sync}
      className="notes-box min-h-6 rounded-md px-2 py-1 text-sm leading-relaxed text-ink outline-none"
    />
  );
}

function Tb({ onClick, label, className }: { onClick: () => void; label: string; className?: string }) {
  return (
    <button onClick={onClick} className={`h-6 w-6 rounded text-ink hover:bg-line/60 ${className ?? ''}`}>
      {label}
    </button>
  );
}
