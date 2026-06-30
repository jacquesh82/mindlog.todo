import { chatComplete } from '../llm/chat.js';
import * as aiLog from '../service/ai-log.service.js';
import { resolveAiConfig } from '../service/ai.service.js';

// Turn a rough hand-drawing (a list of primitive shapes from the notes canvas)
// into a clean SVG: a tidied schema, a chart, or a diagram, depending on the
// instruction. The model returns a single self-contained <svg> document which
// the client sanitizes before rendering.

export interface DrawShape {
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  stroke?: string;
  fill?: string;
  fillStyle?: string;
  text?: string;
}

export interface CleanupDrawingInput {
  shapes: DrawShape[];
  /** What to make of the sketch, e.g. "clean schema", "bar chart", "flowchart". */
  instruction?: string;
  width: number;
  height: number;
}

export interface CleanupDrawingResult {
  svg: string;
}

const SYSTEM =
  'You are a diagramming assistant. You receive a rough sketch as a JSON list of ' +
  'primitive shapes (rectangles, ellipses, triangles, lines, arrows) with their ' +
  'positions, sizes and colours, plus a target intent. Redraw it cleanly as a ' +
  'single self-contained SVG: align and distribute elements on a tidy grid, ' +
  'straighten lines, keep the overall layout and colours, add readable labels ' +
  'when the intent calls for them, and connect related shapes with arrows. ' +
  'Respond with ONLY the SVG document — no markdown fences, no prose. The root ' +
  '<svg> MUST declare width, height and a viewBox, use no <script>, no event ' +
  'handlers and no external references.';

/** Extract the `<svg>…</svg>` document from a model reply (drops fences/prose). */
function extractSvg(text: string): string {
  const m = text.match(/<svg[\s\S]*<\/svg>/i);
  return (m ? m[0] : '').trim();
}

export async function cleanupDrawing(
  userId: string,
  input: CleanupDrawingInput,
): Promise<CleanupDrawingResult> {
  const intent = input.instruction?.trim() || 'a clean, tidied version of the sketch';
  const prompt =
    `Target intent: ${intent}.\n` +
    `Canvas size: ${Math.round(input.width)}x${Math.round(input.height)}.\n` +
    `Shapes (JSON):\n${JSON.stringify(input.shapes)}`;

  const ai = await resolveAiConfig(userId);
  if (ai.cloud) await aiLog.assertWithinLimit(userId);

  const result = await chatComplete({
    provider: ai.provider,
    model: ai.model,
    apiKey: ai.apiKey,
    system: SYSTEM,
    prompt,
    maxTokens: 2048,
  });

  await aiLog.record(userId, {
    kind: 'cleanup_drawing',
    model: ai.model,
    prompt,
    response: result.text,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return { svg: extractSvg(result.text) };
}
