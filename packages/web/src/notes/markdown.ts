import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

// CommonMark 0.31.2 rendering: markdown-it's 'commonmark' preset is the spec
// profile (no GFM extras). Raw HTML is allowed per the spec but the output is
// always sanitized before it reaches the DOM.
const md: MarkdownIt = new MarkdownIt('commonmark', { html: true });

export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(md.render(src), { USE_PROFILES: { html: true } });
}
