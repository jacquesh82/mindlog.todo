import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import { useToast } from '../toast';

// A drawing block for the notes canvas: sketch primitive shapes (rectangle,
// ellipse, triangle, line, arrow) with a stroke colour and an optional solid /
// hatched fill, then optionally ask the AI to redraw the sketch cleanly as an
// SVG (a tidy schema, chart or diagram).

export type ShapeType = 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow' | 'pencil' | 'text';
export type FillStyle = 'none' | 'solid' | 'hatch';

export interface DrawShape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  fill: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  /** Freehand path points, flat [x0,y0,x1,y1,…] (type 'pencil'). */
  points?: number[];
  /** Annotation label (type 'text'). */
  text?: string;
}

export interface DrawBoxData {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shapes: DrawShape[];
  aiSvg?: string;
}

const rid = () => Math.random().toString(36).slice(2, 10);

const STROKES = ['#1f2937', '#db4c3f', '#d97706', '#16a34a', '#2563eb', '#7c3aed'];
const TOOLS: { type: ShapeType; glyph: string; key: string }[] = [
  { type: 'rect', glyph: '▭', key: 'draw.rect' },
  { type: 'ellipse', glyph: '◯', key: 'draw.ellipse' },
  { type: 'triangle', glyph: '△', key: 'draw.triangle' },
  { type: 'line', glyph: '╱', key: 'draw.line' },
  { type: 'arrow', glyph: '↗', key: 'draw.arrow' },
  { type: 'pencil', glyph: '✎', key: 'draw.pencil' },
  { type: 'text', glyph: 'A', key: 'draw.text' },
];
// AI redraw intents (mapped to localized labels in the menu).
const AI_INTENTS = [
  { key: 'draw.aiSchema', instruction: 'a clean, aligned schema/diagram of the sketch' },
  { key: 'draw.aiChart', instruction: 'a chart (bar/line/pie) that best represents the sketch' },
  { key: 'draw.aiFlow', instruction: 'a flowchart connecting the shapes with labelled arrows' },
];

/** Normalise a bounding box to positive width/height (for area shapes). */
function norm(s: DrawShape): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(s.x, s.x + s.w),
    y: Math.min(s.y, s.y + s.h),
    w: Math.abs(s.w),
    h: Math.abs(s.h),
  };
}

function patternId(boxId: string, color: string): string {
  return `hatch-${boxId}-${color.replace(/[^a-z0-9]/gi, '')}`;
}

/** fill attribute for a shape, resolving solid colour or hatch pattern. */
function fillFor(boxId: string, s: DrawShape): string {
  if (s.fillStyle === 'none') return 'none';
  if (s.fillStyle === 'solid') return s.fill;
  return `url(#${patternId(boxId, s.fill)})`;
}

/** Strip anything executable/external from an AI-returned SVG before rendering. */
function sanitizeSvg(svg: string): string {
  try {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = doc.documentElement;
    if (root.nodeName.toLowerCase() !== 'svg') return '';
    root.querySelectorAll('script,foreignObject,iframe,image,a,use').forEach((el) => el.remove());
    root.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const n = attr.name.toLowerCase();
        if (n.startsWith('on') || ((n === 'href' || n === 'xlink:href') && !attr.value.startsWith('#'))) {
          el.removeAttribute(attr.name);
        }
      }
    });
    return new XMLSerializer().serializeToString(root);
  } catch {
    return '';
  }
}

interface Props {
  box: DrawBoxData;
  active: boolean;
  canvasW: number;
  onActivate: () => void;
  onChange: (patch: Partial<DrawBoxData>) => void;
  onDelete: () => void;
}

export function NotesDraw({ box, active, canvasW, onActivate, onChange, onDelete }: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const surfaceRef = useRef<SVGSVGElement>(null);
  const aiRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<'select' | ShapeType>('rect');
  const [stroke, setStroke] = useState(STROKES[0]!);
  const [fill, setFill] = useState(STROKES[0]!);
  const [fillStyle, setFillStyle] = useState<FillStyle>('none');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<DrawShape | null>(null);
  const [view, setView] = useState<'draw' | 'ai'>(box.aiSvg ? 'ai' : 'draw');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  // Id of the text annotation currently being edited via the overlay input.
  const [editingText, setEditingText] = useState<string | null>(null);

  // Pointer interaction bookkeeping (drawing a new shape OR moving a selected one).
  const action = useRef<
    | { kind: 'draw'; start: { x: number; y: number } }
    | { kind: 'move'; id: string; start: { x: number; y: number }; orig: { x: number; y: number; points?: number[] } }
    | null
  >(null);

  // Render the AI SVG (sanitized) into a container via innerHTML.
  useEffect(() => {
    if (view !== 'ai' || !aiRef.current) return;
    aiRef.current.innerHTML = box.aiSvg ? sanitizeSvg(box.aiSvg) : '';
  }, [view, box.aiSvg]);

  function localPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = surfaceRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Commit (or drop, if empty) the text of an annotation being edited. */
  function commitText(id: string, value: string) {
    const v = value.trim();
    onChange({
      shapes: v
        ? box.shapes.map((s) => (s.id === id ? { ...s, text: v } : s))
        : box.shapes.filter((s) => s.id !== id),
    });
    setEditingText(null);
  }

  function hitTest(p: { x: number; y: number }): DrawShape | null {
    for (let i = box.shapes.length - 1; i >= 0; i--) {
      const s = box.shapes[i]!;
      const n = norm(s);
      if (p.x >= n.x - 4 && p.x <= n.x + n.w + 4 && p.y >= n.y - 4 && p.y <= n.y + n.h + 4) return s;
    }
    return null;
  }

  /** Apply a patch to the selected shape (e.g. change fill/stroke after drawing). */
  function patchSelected(patch: Partial<DrawShape>) {
    if (!selected) return;
    onChange({ shapes: box.shapes.map((s) => (s.id === selected ? { ...s, ...patch } : s)) });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (view !== 'draw') return;
    onActivate();
    const p = localPoint(e);
    if (tool === 'select') {
      surfaceRef.current?.setPointerCapture(e.pointerId);
      const hit = hitTest(p);
      setSelected(hit?.id ?? null);
      if (hit) action.current = { kind: 'move', id: hit.id, start: p, orig: { x: hit.x, y: hit.y, points: hit.points } };
      return;
    }
    if (tool === 'text') {
      // A text annotation is placed on click and edited inline (no drag).
      const s: DrawShape = { id: rid(), type: 'text', x: p.x, y: p.y, w: 160, h: 24, stroke, fill, fillStyle: 'none', strokeWidth: 2, text: '' };
      onChange({ shapes: [...box.shapes, s] });
      setSelected(s.id);
      setEditingText(s.id);
      return;
    }
    surfaceRef.current?.setPointerCapture(e.pointerId);
    const base: DrawShape = { id: rid(), type: tool, x: p.x, y: p.y, w: 0, h: 0, stroke, fill, fillStyle, strokeWidth: 2 };
    if (tool === 'pencil') base.points = [p.x, p.y];
    setDraft(base);
    action.current = { kind: 'draw', start: p };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!action.current) return;
    const p = localPoint(e);
    if (action.current.kind === 'draw') {
      const start = action.current.start;
      setDraft((d) => {
        if (!d) return d;
        if (d.type === 'pencil') return { ...d, points: [...(d.points ?? []), p.x, p.y], w: p.x - start.x, h: p.y - start.y };
        return { ...d, w: p.x - start.x, h: p.y - start.y };
      });
    } else {
      const { id, start, orig } = action.current;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      onChange({
        shapes: box.shapes.map((s) => {
          if (s.id !== id) return s;
          const moved: DrawShape = { ...s, x: orig.x + dx, y: orig.y + dy };
          if (orig.points) moved.points = orig.points.map((v, i) => v + (i % 2 === 0 ? dx : dy));
          return moved;
        }),
      });
    }
  }

  function onPointerUp() {
    if (action.current?.kind === 'draw' && draft) {
      let shape = draft;
      let keep = Math.abs(draft.w) > 4 || Math.abs(draft.h) > 4;
      if (draft.type === 'pencil') {
        const pts = draft.points ?? [];
        keep = pts.length >= 4; // at least two points
        if (keep) {
          const xs = pts.filter((_, i) => i % 2 === 0);
          const ys = pts.filter((_, i) => i % 2 === 1);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          shape = { ...draft, x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
        }
      }
      if (keep) {
        onChange({ shapes: [...box.shapes, shape] });
        setSelected(shape.id);
      }
      setDraft(null);
    }
    action.current = null;
  }

  function deleteSelected() {
    if (!selected) return;
    onChange({ shapes: box.shapes.filter((s) => s.id !== selected) });
    setSelected(null);
  }

  async function runAi(instruction: string) {
    setAiOpen(false);
    if (box.shapes.length === 0) {
      toast(t('draw.empty'), 'error');
      return;
    }
    setAiBusy(true);
    try {
      const { svg } = await api.cleanupDrawing({
        shapes: box.shapes.map((s) => {
          const n = norm(s);
          return { type: s.type, x: n.x, y: n.y, w: n.w, h: n.h, stroke: s.stroke, fill: s.fill, fillStyle: s.fillStyle, text: s.text };
        }),
        instruction,
        width: box.w,
        height: box.h,
      });
      if (!svg) {
        toast(t('draw.aiFailed'), 'error');
        return;
      }
      onChange({ aiSvg: svg });
      setView('ai');
    } catch {
      toast(t('draw.aiFailed'), 'error');
    } finally {
      setAiBusy(false);
    }
  }

  // --- block move / resize (pointer + window listeners) ---
  function startBlockMove(e: React.PointerEvent) {
    e.preventDefault();
    onActivate();
    const start = { x: e.clientX, y: e.clientY, bx: box.x, by: box.y };
    const move = (ev: PointerEvent) =>
      onChange({ x: Math.max(0, start.bx + ev.clientX - start.x), y: Math.max(0, start.by + ev.clientY - start.y) });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function startBlockResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, bw: box.w, bh: box.h };
    const move = (ev: PointerEvent) =>
      onChange({ w: Math.max(160, start.bw + ev.clientX - start.x), h: Math.max(120, start.bh + ev.clientY - start.y) });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const hatchColors = Array.from(
    new Set(box.shapes.concat(draft ? [draft] : []).filter((s) => s.fillStyle === 'hatch').map((s) => s.fill)),
  );
  const allShapes = draft ? [...box.shapes, draft] : box.shapes;
  const toolbarBelow = box.y < 56;

  return (
    <div
      className={`absolute rounded-md border bg-surface ${active ? 'border-brand shadow-md' : 'border-line/50 shadow-sm hover:border-line'}`}
      style={{ left: box.x, top: box.y, width: box.w }}
      onPointerDown={onActivate}
    >
      {active && (
        <div
          className={`absolute z-10 flex max-w-[min(90vw,560px)] flex-wrap items-center gap-0.5 rounded-md border border-line bg-surface px-1 py-0.5 text-sm shadow ${
            toolbarBelow ? 'top-full mt-1' : 'bottom-full mb-1'
          } ${canvasW > 0 && box.x > canvasW / 2 ? 'right-0' : 'left-0'}`}
        >
          <button onPointerDown={startBlockMove} className="cursor-move px-1 text-muted" title={t('notes.move')}>✥</button>
          <span className="mx-0.5 text-line">|</span>

          {/* draw/ai view toggle (only once an AI render exists) */}
          {box.aiSvg && (
            <>
              <button
                onClick={() => setView('draw')}
                className={`rounded px-1.5 text-xs ${view === 'draw' ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-line/60'}`}
              >{t('draw.tabDraw')}</button>
              <button
                onClick={() => setView('ai')}
                className={`rounded px-1.5 text-xs ${view === 'ai' ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-line/60'}`}
              >{t('draw.tabAi')}</button>
              <span className="mx-0.5 text-line">|</span>
            </>
          )}

          {view === 'draw' && (
            <>
              <button
                onClick={() => setTool('select')}
                className={`h-6 w-6 rounded ${tool === 'select' ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-line/60'}`}
                title={t('draw.select')}
              >⤢</button>
              {TOOLS.map((tl) => (
                <button
                  key={tl.type}
                  onClick={() => setTool(tl.type)}
                  className={`h-6 w-6 rounded ${tool === tl.type ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-line/60'}`}
                  title={t(tl.key)}
                >{tl.glyph}</button>
              ))}
              <span className="mx-0.5 text-line">|</span>
              {STROKES.map((c) => (
                <button
                  key={c}
                  onClick={() => { setStroke(c); setFill(c); patchSelected({ stroke: c, fill: c }); }}
                  className={`h-4 w-4 rounded-full border ${stroke === c ? 'border-brand ring-1 ring-brand' : 'border-line'}`}
                  style={{ backgroundColor: c }}
                  title={t('draw.color')}
                />
              ))}
              <span className="mx-0.5 text-line">|</span>
              {(['none', 'solid', 'hatch'] as FillStyle[]).map((fs) => (
                <button
                  key={fs}
                  onClick={() => { setFillStyle(fs); patchSelected({ fillStyle: fs }); }}
                  className={`h-6 rounded px-1 text-xs ${fillStyle === fs ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-line/60'}`}
                  title={t(`draw.fill.${fs}`)}
                >{fs === 'none' ? '⬜' : fs === 'solid' ? '⬛' : '▤'}</button>
              ))}
              <span className="mx-0.5 text-line">|</span>
              <button
                onClick={deleteSelected}
                disabled={!selected}
                className="h-6 rounded px-1 text-xs text-ink hover:bg-line/60 disabled:opacity-40"
                title={t('draw.deleteShape')}
              >⌫</button>
            </>
          )}

          {/* AI cleanup menu */}
          <span className="mx-0.5 text-line">|</span>
          <div className="relative">
            <button
              onClick={() => setAiOpen((o) => !o)}
              disabled={aiBusy}
              className="rounded px-1.5 text-xs text-brand hover:bg-brand-soft disabled:opacity-50"
              title={t('draw.ai')}
            >{aiBusy ? '…' : `✨ ${t('draw.ai')}`}</button>
            {aiOpen && (
              <ul className="absolute right-0 top-full z-20 mt-1 min-w-44 overflow-hidden rounded-md border border-line bg-surface text-left shadow-lg">
                {AI_INTENTS.map((it) => (
                  <li key={it.key}>
                    <button
                      onClick={() => void runAi(it.instruction)}
                      className="block w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-brand-soft"
                    >{t(it.key)}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={onDelete} className="px-1 text-muted hover:text-[var(--color-p1)]" title={t('draw.deleteBlock')}>🗑</button>
        </div>
      )}

      {view === 'ai' && box.aiSvg ? (
        <div ref={aiRef} className="overflow-auto p-2 [&_svg]:h-auto [&_svg]:max-w-full" style={{ height: box.h }} />
      ) : (
        <svg
          ref={surfaceRef}
          width={box.w}
          height={box.h}
          className={`block rounded-md ${tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={(e) => {
            const hit = hitTest(localPoint(e));
            if (hit?.type === 'text') { setSelected(hit.id); setEditingText(hit.id); }
          }}
        >
          <defs>
            {hatchColors.map((c) => (
              <pattern key={c} id={patternId(box.id, c)} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke={c} strokeWidth="1.5" />
              </pattern>
            ))}
          </defs>
          {allShapes.map((s) => (
            <ShapeNode key={s.id} boxId={box.id} shape={s} selected={s.id === selected} />
          ))}
        </svg>
      )}

      {editingText && view === 'draw' && (() => {
        const s = box.shapes.find((x) => x.id === editingText);
        if (!s) return null;
        return (
          <input
            autoFocus
            defaultValue={s.text ?? ''}
            onBlur={(e) => commitText(editingText, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
              if (e.key === 'Escape') { e.preventDefault(); commitText(editingText, (e.target as HTMLInputElement).value); }
            }}
            placeholder={t('draw.textPlaceholder')}
            style={{ left: s.x, top: s.y, color: s.stroke }}
            className="absolute z-20 min-w-24 rounded border border-brand bg-surface px-1 text-sm outline-none"
          />
        );
      })()}

      {active && (
        <div
          onPointerDown={startBlockResize}
          title={t('notes.resize')}
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-brand bg-surface"
        />
      )}
    </div>
  );
}

/** Render one primitive as SVG. */
function ShapeNode({ boxId, shape, selected }: { boxId: string; shape: DrawShape; selected: boolean }) {
  const n = norm(shape);
  const common = {
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth,
    fill: fillFor(boxId, shape),
    vectorEffect: 'non-scaling-stroke' as const,
  };
  const halo = selected ? { filter: 'drop-shadow(0 0 0 1px var(--color-brand))', opacity: 1 } : undefined;
  let node;
  if (shape.type === 'rect') {
    node = <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={3} {...common} />;
  } else if (shape.type === 'ellipse') {
    node = <ellipse cx={n.x + n.w / 2} cy={n.y + n.h / 2} rx={n.w / 2} ry={n.h / 2} {...common} />;
  } else if (shape.type === 'triangle') {
    node = <polygon points={`${n.x + n.w / 2},${n.y} ${n.x},${n.y + n.h} ${n.x + n.w},${n.y + n.h}`} {...common} />;
  } else if (shape.type === 'pencil') {
    const pts = shape.points ?? [];
    const str = pts.reduce((acc, v, i) => (i % 2 === 0 ? `${acc} ${v}` : `${acc},${v}`), '').trim();
    node = (
      <polyline
        points={str}
        fill="none"
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    );
  } else if (shape.type === 'text') {
    node = (
      <text x={shape.x} y={shape.y + 16} fill={shape.stroke} fontSize={16} style={{ userSelect: 'none' }}>
        {shape.text ?? ''}
      </text>
    );
  } else {
    // line / arrow: keep direction (start = x,y; end = x+w,y+h).
    const x1 = shape.x;
    const y1 = shape.y;
    const x2 = shape.x + shape.w;
    const y2 = shape.y + shape.h;
    const line = <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={shape.stroke} strokeWidth={shape.strokeWidth} />;
    if (shape.type === 'line') {
      node = line;
    } else {
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const len = 10;
      const a1 = ang + Math.PI - 0.45;
      const a2 = ang + Math.PI + 0.45;
      const head = `${x2},${y2} ${x2 + len * Math.cos(a1)},${y2 + len * Math.sin(a1)} ${x2 + len * Math.cos(a2)},${y2 + len * Math.sin(a2)}`;
      node = (
        <g>
          {line}
          <polygon points={head} fill={shape.stroke} />
        </g>
      );
    }
  }
  return <g style={halo}>{node}</g>;
}
