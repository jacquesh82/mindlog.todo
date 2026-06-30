// A note page stores BOTH representations so switching modes never loses data:
//   { mode, boxes, markdown }
// - blocks mode → the floating-block canvas (NotesEditor) edits `boxes`.
// - raw   mode → the CommonMark editor (NotesRawEditor) edits `markdown`.
// Legacy pages are either `{ boxes }` JSON or plain text; both map to blocks.

export type PageMode = 'blocks' | 'raw';

export interface ParsedPage {
  mode: PageMode;
  /** `{ boxes:[…] }` JSON string fed to NotesEditor (round-trips unchanged). */
  blocksContent: string;
  markdown: string;
}

export function parsePageContent(content: string): ParsedPage {
  try {
    const j = JSON.parse(content) as { mode?: string; boxes?: unknown[]; markdown?: string };
    if (j && typeof j === 'object' && (Array.isArray(j.boxes) || 'markdown' in j || 'mode' in j)) {
      return {
        mode: j.mode === 'raw' ? 'raw' : 'blocks',
        blocksContent: JSON.stringify({ boxes: Array.isArray(j.boxes) ? j.boxes : [] }),
        markdown: typeof j.markdown === 'string' ? j.markdown : '',
      };
    }
  } catch {
    /* legacy plain text → hand it to NotesEditor verbatim (it makes one box). */
  }
  return { mode: 'blocks', blocksContent: content, markdown: '' };
}

/** Re-wrap NotesEditor's `{ boxes }` output together with the markdown + mode. */
export function serializePageContent(mode: PageMode, blocksContent: string, markdown: string): string {
  let boxes: unknown[] = [];
  try {
    const j = JSON.parse(blocksContent) as { boxes?: unknown[] };
    if (Array.isArray(j?.boxes)) boxes = j.boxes;
  } catch {
    /* blocksContent may be legacy plain text; drop into a fresh boxes array */
  }
  return JSON.stringify({ mode, boxes, markdown });
}
