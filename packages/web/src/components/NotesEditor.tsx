import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import type { Label, Project } from '../types';

// A OneNote-style page canvas: double-click empty space to drop a movable text
// box; each box is rich-text editable (bold / italic / underline / lists /
// highlight), supports #project / @label autocomplete, and can convert its text
// into a real Inbox task rendered inline (with two-way completion state).

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  html: string;
}

const rid = () => Math.random().toString(36).slice(2, 10);

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Inline widget for a note line linked to a real task (round checkbox + title). */
function taskWidgetHtml(taskId: string, title: string, done: boolean): string {
  return (
    `<span class="note-task" data-task-id="${taskId}" data-done="${done ? '1' : '0'}" contenteditable="false">` +
    `<span class="note-task-box"></span><span class="note-task-title">${escapeHtml(title)}</span></span>`
  );
}

/** Task ids referenced by a box's HTML (for status sync on open). */
function extractTaskIds(html: string): string[] {
  return Array.from(html.matchAll(/data-task-id="([^"]+)"/g)).map((m) => m[1]!);
}

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
// Text colours — a small fixed palette (max 5) instead of a free colour picker.
const TEXT_COLORS = ['#db4c3f', '#d97706', '#16a34a', '#2563eb', '#7c3aed'];

const FONTS = [
  { label: 'Sans', value: 'system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Mono', value: 'ui-monospace, monospace' },
  { label: 'Rounded', value: '"Comic Sans MS", "Segoe Print", cursive' },
];
// execCommand('fontSize') uses the legacy 1–7 scale.
const SIZES = [
  { label: 'XS', value: '1' },
  { label: 'S', value: '2' },
  { label: 'M', value: '3' },
  { label: 'L', value: '5' },
  { label: 'XL', value: '6' },
  { label: 'XXL', value: '7' },
];

/** The #project / @label token being typed at the caret, with its screen anchor. */
interface AutoComplete {
  sigil: '#' | '@';
  query: string;
  x: number;
  y: number;
}

interface Props {
  initialContent: string;
  onChange: (content: string) => void;
  /** Create a real task from a note line; resolves to the created task (id+title). */
  onCreateTask: (text: string) => Promise<{ id: string; title: string } | null>;
  projects: Project[];
  labels: Label[];
}

export function NotesEditor({ initialContent, onChange, onCreateTask, projects, labels }: Props) {
  const { t } = useI18n();
  const [boxes, setBoxes] = useState<Box[]>(() => parseBoxes(initialContent));
  const [active, setActive] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const rez = useRef<{ id: string; startW: number; startX: number } | null>(null);
  const savedRange = useRef<Range | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [ac, setAc] = useState<AutoComplete | null>(null);
  const [acHi, setAcHi] = useState(0);

  const acItems = ac
    ? (ac.sigil === '#' ? projects.filter((p) => !p.isInbox) : labels)
        .filter((x) => x.name.toLowerCase().startsWith(ac.query.toLowerCase()))
        .slice(0, 6)
    : [];

  // Canvas width drives toolbar placement so it never spills past the viewport.
  const [canvasW, setCanvasW] = useState(0);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setCanvasW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // On open: reconcile each linked task's completion state from the server, so a
  // task ticked elsewhere (e.g. the Inbox) shows as done in the note too.
  useEffect(() => {
    const ids = Array.from(new Set(boxes.flatMap((b) => extractTaskIds(b.html))));
    if (ids.length === 0) return;
    let cancelled = false;
    void Promise.all(
      ids.map((id) =>
        api.getTask(id).then((tk) => ({ id, done: tk.status === 'done' })).catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      let changed = false;
      for (const r of results) {
        if (!r) continue;
        document.querySelectorAll(`.note-task[data-task-id="${r.id}"]`).forEach((el) => {
          if ((el.getAttribute('data-done') === '1') !== r.done) {
            el.setAttribute('data-done', r.done ? '1' : '0');
            changed = true;
          }
        });
      }
      if (changed) persistDom();
    });
    return () => {
      cancelled = true;
    };
    // mount only (the page remounts this component via key={page.id})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the last selection made inside a note box, so toolbar controls that
  // steal focus (selects, colour input) can restore it before applying a style.
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      const node = r.commonAncestorContainer;
      const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
      if (el?.closest('.notes-box')) savedRange.current = r.cloneRange();
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  /** Restore the saved selection, run a styling command, then persist. */
  function applyStyle(run: () => void) {
    const r = savedRange.current;
    if (!r) return;
    const node = r.commonAncestorContainer;
    const box = ((node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest('.notes-box')) as HTMLElement | null;
    if (!box) return;
    box.focus();
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    document.execCommand('styleWithCSS', false, 'true');
    run();
    updateHtml(box.id.replace('box-', ''), box.innerHTML);
  }

  // Persist (debounced) whenever boxes change.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = (next: Box[]) => {
    setBoxes(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onChange(JSON.stringify({ boxes: next })), 500);
  };

  /** Pull each box's live DOM innerHTML back into state and persist immediately. */
  function persistDom() {
    setBoxes((bs) => {
      const next = bs.map((b) => {
        const el = document.getElementById(`box-${b.id}`);
        return el ? { ...b, html: el.innerHTML } : b;
      });
      onChange(JSON.stringify({ boxes: next }));
      return next;
    });
  }

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

  function insertCheckbox() {
    document.execCommand('insertHTML', false, '<span class="note-check" contenteditable="false">☐</span>&nbsp;');
  }

  function insertTable(rows = 3, cols = 3) {
    const cell = '<td>&nbsp;</td>';
    const row = `<tr>${cell.repeat(cols)}</tr>`;
    // Wrap in a horizontally-resizable box so the whole table can be widened.
    const html = `<div style="display:inline-block;overflow:auto;resize:horizontal;max-width:100%;margin:6px 0"><table style="width:100%">${row.repeat(rows)}</table></div><div><br></div>`;
    document.execCommand('insertHTML', false, html);
  }

  /** Add / remove a row or column relative to the cell holding the caret. */
  function tableOp(op: 'addRow' | 'delRow' | 'addCol' | 'delCol') {
    const sel = window.getSelection();
    const node = sel?.rangeCount ? sel.getRangeAt(0).startContainer : null;
    const el = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
    const cell = el?.closest('td,th') as HTMLTableCellElement | null;
    const box = el?.closest('.notes-box') as HTMLElement | null;
    if (!cell || !box) return;
    const row = cell.parentElement as HTMLTableRowElement;
    const table = cell.closest('table') as HTMLTableElement;
    const col = Array.from(row.children).indexOf(cell);
    if (op === 'addRow') {
      const nr = row.cloneNode(true) as HTMLTableRowElement;
      Array.from(nr.children).forEach((c) => (c.innerHTML = '&nbsp;'));
      row.after(nr);
    } else if (op === 'delRow') {
      if (table.rows.length > 1) row.remove();
    } else if (op === 'addCol') {
      for (const r of Array.from(table.rows)) {
        const c = document.createElement('td');
        c.innerHTML = '&nbsp;';
        (r.children[col] ?? r.lastElementChild)?.after(c);
      }
    } else if (op === 'delCol') {
      for (const r of Array.from(table.rows)) {
        if (r.children.length > 1) r.children[col]?.remove();
      }
    }
    updateHtml(box.id.replace('box-', ''), box.innerHTML);
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

  /**
   * Convert the caret's CURRENT LINE into a real task, rendered inline (linked
   * widget), leaving the rest of the box untouched. Falls back to the whole box
   * only when the caret isn't inside it (e.g. no selection).
   */
  async function createTask(id: string) {
    const box = document.getElementById(`box-${id}`);
    if (!box) return;

    // Capture the line under the caret via selection.modify (Chromium/WebKit).
    const sel = window.getSelection();
    let lineRange: Range | null = null;
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0);
      const host = r.startContainer.nodeType === 1 ? (r.startContainer as Element) : r.startContainer.parentElement;
      const mod = sel as Selection & { modify?: (alter: string, dir: string, granularity: string) => void };
      if (host?.closest('.notes-box') === box && typeof mod.modify === 'function') {
        sel.collapse(r.startContainer, r.startOffset);
        mod.modify('move', 'backward', 'lineboundary');
        mod.modify('extend', 'forward', 'lineboundary');
        lineRange = sel.getRangeAt(0).cloneRange();
      }
    }

    // Strip a leading checkbox/bullet glyph so Quick Add parses dates/times cleanly.
    const raw = (lineRange ? lineRange.toString() : box.textContent ?? '').trim();
    const text = raw.replace(/^[☐☑▪•·-]\s*/, '').trim();
    if (!text) return;

    const task = await onCreateTask(text);
    if (!task) return;

    // Replace only the line (or the whole box on fallback) with the widget.
    const widget = document.createRange().createContextualFragment(taskWidgetHtml(task.id, task.title, false));
    if (lineRange) {
      lineRange.deleteContents();
      lineRange.insertNode(widget);
    } else {
      box.replaceChildren(widget);
    }
    updateHtml(id, box.innerHTML);
  }

  /** Toggle a linked task's completion server-side (the DOM is updated optimistically). */
  function toggleTask(taskId: string, done: boolean) {
    api.updateTask(taskId, { status: done ? 'done' : 'todo' }).catch(() => {
      /* leave the optimistic state; a reload reconciles from the server */
    });
  }

  // --- #project / @label autocomplete inside the contentEditable boxes ---

  /** The #/@ token immediately before a collapsed caret, if any. */
  function caretToken(): { sigil: '#' | '@'; query: string } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const before = (range.startContainer.textContent ?? '').slice(0, range.startOffset);
    const m = before.match(/([#@])([\p{L}\p{N}_-]*)$/u);
    return m ? { sigil: m[1] as '#' | '@', query: m[2]! } : null;
  }

  function refreshAutocomplete() {
    const tok = caretToken();
    if (!tok) {
      setAc(null);
      return;
    }
    const range = window.getSelection()!.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setAc({ sigil: tok.sigil, query: tok.query, x: rect.left, y: rect.bottom });
    setAcHi(0);
  }

  /** Replace the in-progress #/@ token with the chosen name and persist. */
  function pickAutocomplete(name: string) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent ?? '';
    const before = text.slice(0, range.startOffset);
    const m = before.match(/([#@])([\p{L}\p{N}_-]*)$/u);
    if (!m) return;
    const start = range.startOffset - m[0].length;
    const insert = `${m[1]}${name} `;
    node.textContent = text.slice(0, start) + insert + text.slice(range.startOffset);
    const caret = start + insert.length;
    const nr = document.createRange();
    nr.setStart(node, caret);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);
    setAc(null);
    const box = (node.parentElement as HTMLElement | null)?.closest('.notes-box') as HTMLElement | null;
    if (box) updateHtml(box.id.replace('box-', ''), box.innerHTML);
  }

  /** Persist the box currently holding the caret (after a DOM-level edit). */
  function persistCaretBox() {
    const sel = window.getSelection();
    const node = sel?.rangeCount ? sel.getRangeAt(0).startContainer : null;
    const el = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
    const box = el?.closest('.notes-box') as HTMLElement | null;
    if (box) updateHtml(box.id.replace('box-', ''), box.innerHTML);
  }

  /**
   * If the caret sits on a checkbox line with text, Enter starts a new checkbox
   * line (so checklists keep going like real lists do). Returns true if handled.
   */
  function continueCheckbox(): boolean {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const el = range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement;
    const box = el?.closest('.notes-box') as HTMLElement | null;
    if (!box) return false;
    // HTML of the current line = everything from the box start to the caret,
    // after the last line break.
    const probe = document.createRange();
    probe.setStart(box, 0);
    probe.setEnd(range.startContainer, range.startOffset);
    const holder = document.createElement('div');
    holder.appendChild(probe.cloneContents());
    const line = holder.innerHTML.split(/<br\s*\/?>|<\/div>|<\/p>/i).pop() ?? '';
    if (!/class="note-check"/.test(line)) return false;
    // Only continue when the line has actual text after the checkbox (else let a
    // bare Enter end the checklist).
    const textAfter = line.replace(/<[^>]+>/g, '').replace(/&nbsp;|☐|☑/g, '').trim();
    if (!textAfter) return false;
    document.execCommand('insertHTML', false, '<br><span class="note-check" contenteditable="false">☐</span>&nbsp;');
    return true;
  }

  function onBoxKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Autocomplete navigation takes precedence while its popup is open.
    if (ac && acItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAcHi((h) => (h + 1) % acItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAcHi((h) => (h - 1 + acItems.length) % acItems.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickAutocomplete(acItems[acHi]!.name);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setAc(null);
      }
      return;
    }

    // Tab / Shift+Tab → indent / outdent: nests list items (sub-tasks / sub-lists)
    // and indents plain text, keeping the line's type from the row above.
    if (e.key === 'Tab') {
      e.preventDefault();
      exec(e.shiftKey ? 'outdent' : 'indent');
      persistCaretBox();
      return;
    }

    // Enter auto-continues a checkbox line (native lists already self-continue).
    if (e.key === 'Enter' && !e.shiftKey && continueCheckbox()) {
      e.preventDefault();
      persistCaretBox();
    }
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
          className={`absolute rounded-md border bg-surface ${active === b.id ? 'border-brand shadow-md' : 'border-line/50 shadow-sm hover:border-line'}`}
          style={{ left: b.x, top: b.y, width: b.w }}
          onMouseDown={() => setActive(b.id)}
        >
          {active === b.id && (
            <div
              className={`absolute z-10 flex max-w-[min(90vw,560px)] flex-wrap items-center gap-0.5 rounded-md border border-line bg-surface px-1 py-0.5 text-sm shadow ${
                b.y < 44 ? 'top-full mt-1' : 'bottom-full mb-1'
              } ${canvasW > 0 && b.x > canvasW / 2 ? 'right-0' : 'left-0'}`}
            >
              <button
                onMouseDown={(e) => { e.preventDefault(); drag.current = { id: b.id, dx: 0, dy: 0 }; }}
                className="cursor-move px-1 text-muted"
                title={t('notes.move')}
              >✥</button>
              <span className="mx-0.5 text-line">|</span>
              <Tb onClick={() => exec('bold')} label="B" className="font-bold" />
              <Tb onClick={() => exec('italic')} label="I" className="italic" />
              <Tb onClick={() => exec('underline')} label="U" className="underline" />
              <span className="mx-0.5 text-line">|</span>
              <select
                value=""
                title={t('notes.font')}
                onChange={(e) => { const v = e.target.value; if (v) applyStyle(() => document.execCommand('fontName', false, v)); }}
                className="h-6 rounded border border-line bg-surface px-1 text-xs text-ink outline-none"
              >
                <option value="">{t('notes.font')}</option>
                {FONTS.map((f) => <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
              </select>
              <select
                value=""
                title={t('notes.size')}
                onChange={(e) => { const v = e.target.value; if (v) applyStyle(() => document.execCommand('fontSize', false, v)); }}
                className="h-6 rounded border border-line bg-surface px-1 text-xs text-ink outline-none"
              >
                <option value="">{t('notes.size')}</option>
                {SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <span className="text-xs text-muted" title={t('notes.color')}>A</span>
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => exec('foreColor', c)}
                  title={t('notes.color')}
                  className="h-4 w-4 rounded-full border border-line"
                  style={{ backgroundColor: c }}
                />
              ))}
              <span className="mx-0.5 text-line">|</span>
              <Tb onClick={() => exec('insertUnorderedList')} label="•" />
              <Tb onClick={() => exec('insertOrderedList')} label="1." />
              <Tb onClick={insertCheckbox} label="☑" title={t('notes.checkbox')} />
              <Tb onClick={() => insertTable()} label="⊞" title={t('notes.table')} />
              <Tb onClick={() => tableOp('addRow')} label="⊞↓" className="w-7 text-xs" title={t('notes.addRow')} />
              <Tb onClick={() => tableOp('addCol')} label="⊞→" className="w-7 text-xs" title={t('notes.addCol')} />
              <Tb onClick={() => tableOp('delRow')} label="⊟↑" className="w-7 text-xs" title={t('notes.delRow')} />
              <Tb onClick={() => tableOp('delCol')} label="⊟←" className="w-7 text-xs" title={t('notes.delCol')} />
              <span className="mx-0.5 text-line">|</span>
              {HIGHLIGHTS.map((c) => (
                <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('hiliteColor', c)} title={t('notes.highlight')}
                  className="h-4 w-4 rounded-sm border border-line" style={{ backgroundColor: c === 'transparent' ? undefined : c }}>
                  {c === 'transparent' ? '⌀' : ''}
                </button>
              ))}
              <span className="mx-0.5 text-line">|</span>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => void createTask(b.id)} className="rounded px-1.5 text-xs text-brand hover:bg-brand-soft" title={t('notes.createTask')}>✓ {t('notes.task')}</button>
              <button onClick={() => removeBox(b.id)} className="px-1 text-muted hover:text-[var(--color-p1)]">🗑</button>
            </div>
          )}
          <EditableContent
            box={b}
            onFocus={() => setActive(b.id)}
            onPaste={(e) => onPaste(b.id, e)}
            onChange={(html) => updateHtml(b.id, html)}
            onToggleTask={toggleTask}
            onActivity={refreshAutocomplete}
            onKeyDown={onBoxKeyDown}
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

      {ac && acItems.length > 0 && (
        <ul
          className="fixed z-[1200] min-w-40 overflow-hidden rounded-md border border-line bg-surface shadow-lg"
          style={{ left: ac.x, top: ac.y + 4 }}
        >
          {acItems.map((it, i) => (
            <li key={it.id}>
              <button
                onMouseDown={(e) => { e.preventDefault(); pickAutocomplete(it.name); }}
                onMouseEnter={() => setAcHi(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === acHi ? 'bg-brand-soft text-brand' : 'text-ink'}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: it.color ?? '#808080' }} />
                {ac.sigil}{it.name}
              </button>
            </li>
          ))}
        </ul>
      )}
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
  onToggleTask,
  onActivity,
  onKeyDown,
}: {
  box: Box;
  onFocus: () => void;
  onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onChange: (html: string) => void;
  onToggleTask: (taskId: string, done: boolean) => void;
  onActivity: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = box.html;
    // mount only — intentionally not reacting to box.html changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sync = () => onChange(ref.current?.innerHTML ?? '');
  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    // Plain note checkbox (not linked to a task).
    if (target.classList.contains('note-check')) {
      target.textContent = target.textContent === '☑' ? '☐' : '☑';
      sync();
      return;
    }
    // Linked-task checkbox: toggle the real task + reflect it inline.
    const taskBox = target.closest('.note-task-box');
    const taskEl = target.closest('.note-task') as HTMLElement | null;
    if (taskBox && taskEl) {
      const id = taskEl.getAttribute('data-task-id');
      const done = taskEl.getAttribute('data-done') !== '1';
      taskEl.setAttribute('data-done', done ? '1' : '0');
      sync();
      if (id) onToggleTask(id, done);
    }
  }
  return (
    <div
      ref={ref}
      id={`box-${box.id}`}
      contentEditable
      suppressContentEditableWarning
      onFocus={onFocus}
      onPaste={onPaste}
      onClick={onClick}
      onInput={() => { sync(); onActivity(); }}
      onKeyUp={onActivity}
      onKeyDown={onKeyDown}
      onMouseUp={sync}
      className="notes-box min-h-6 rounded-md px-2 py-1 text-sm leading-relaxed text-ink outline-none"
    />
  );
}

function Tb({ onClick, label, className, title }: { onClick: () => void; label: string; className?: string; title?: string }) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`h-6 w-6 rounded text-ink hover:bg-line/60 ${className ?? ''}`}
    >
      {label}
    </button>
  );
}
