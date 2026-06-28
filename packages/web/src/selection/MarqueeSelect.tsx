import { useRef, useState, type ReactNode } from 'react';
import { useSelection } from './Selection';

// Rubber-band selection: drag a translucent rectangle over the wrapped task list;
// every row (an element carrying [data-task-id]) intersecting the rectangle is
// selected. Client coordinates throughout (the marquee box is position:fixed and
// getBoundingClientRect is viewport-relative), so scrolling needs no extra math.
//
// The drag can begin anywhere over the list — even on a task row. A press only
// becomes a marquee once it moves past THRESHOLD, so a plain click still
// opens/completes a task; the click that would follow a real drag is suppressed.

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Don't start a marquee from inside a real text control — there a drag means
// "select text" / "use the field", not "rubber-band".
const NO_MARQUEE = 'input, textarea, select, [contenteditable="true"]';
const THRESHOLD = 5; // px before a press becomes a marquee (lets normal clicks through)

export function MarqueeSelect({ children }: { children: ReactNode }) {
  const { set } = useSelection();
  const containerRef = useRef<HTMLDivElement>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const [box, setBox] = useState<Box | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(NO_MARQUEE)) return;
    origin.current = { x: e.clientX, y: e.clientY };
    dragged.current = false;
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!origin.current) return;
    const { x: x0, y: y0 } = origin.current;
    const w = Math.abs(e.clientX - x0);
    const h = Math.abs(e.clientY - y0);
    if (!dragged.current && w < THRESHOLD && h < THRESHOLD) return;
    if (!dragged.current) {
      dragged.current = true;
      window.getSelection()?.removeAllRanges(); // drop any text selection started by the press
    }

    const x = Math.min(x0, e.clientX);
    const y = Math.min(y0, e.clientY);
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

  // Swallow the click that fires after a real drag, so releasing the marquee
  // doesn't also open a task editor / toggle a checkbox under the cursor.
  function onClickCapture(e: React.MouseEvent) {
    if (dragged.current) {
      e.preventDefault();
      e.stopPropagation();
      dragged.current = false;
    }
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={end}
      onMouseLeave={end}
      onClickCapture={onClickCapture}
      // min-height so the empty space below the list is still a valid drag origin.
      className={`relative min-h-[75vh] ${box ? 'select-none' : ''}`}
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
