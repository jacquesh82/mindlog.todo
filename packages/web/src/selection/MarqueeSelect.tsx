import { useRef, useState, type ReactNode } from 'react';
import { useSelection } from './Selection';

// Rubber-band selection: drag a rectangle over the wrapped task list; every row
// (an element carrying [data-task-id]) intersecting the rectangle is selected.
// Uses client coordinates throughout (the marquee box is position:fixed and
// getBoundingClientRect is viewport-relative), so scrolling needs no extra math.

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const INTERACTIVE = 'button, a, input, textarea, select, [role="button"], [contenteditable="true"]';
const THRESHOLD = 4; // px before a press becomes a marquee (lets normal clicks through)

export function MarqueeSelect({ children }: { children: ReactNode }) {
  const { set } = useSelection();
  const containerRef = useRef<HTMLDivElement>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return; // let buttons/inputs work
    origin.current = { x: e.clientX, y: e.clientY };
    e.preventDefault(); // suppress native text selection while marqueeing
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!origin.current) return;
    const { x: x0, y: y0 } = origin.current;
    const x = Math.min(x0, e.clientX);
    const y = Math.min(y0, e.clientY);
    const w = Math.abs(e.clientX - x0);
    const h = Math.abs(e.clientY - y0);
    if (!box && w < THRESHOLD && h < THRESHOLD) return;
    setBox({ x, y, w, h });

    const ids: string[] = [];
    containerRef.current?.querySelectorAll<HTMLElement>('[data-task-id]').forEach((node) => {
      const b = node.getBoundingClientRect();
      const hit = b.left < x + w && b.right > x && b.top < y + h && b.bottom > y;
      if (hit && node.dataset.taskId) ids.push(node.dataset.taskId);
    });
    set(ids);
  }

  function end() {
    origin.current = null;
    setBox(null);
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={end}
      onMouseLeave={end}
      className="relative"
    >
      {children}
      {box && (
        <div
          className="pointer-events-none fixed z-[900] rounded-sm border border-brand bg-brand/10"
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      )}
    </div>
  );
}
