import { useRef, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import type { Label, Project } from '../types';

interface Props {
  defaultProjectId?: string;
  defaultSectionId?: string;
  projects: Project[];
  labels: Label[];
  onAdded: () => void;
}

interface Suggest {
  sigil: '#' | '@';
  query: string;
  start: number; // index of the sigil in `text`
}

/** Inline natural-language task capture with #project / @label autocomplete. */
export function QuickAdd({ defaultProjectId, defaultSectionId, projects, labels, onAdded }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Candidate completions for the token currently being typed.
  const items = suggest
    ? (suggest.sigil === '#' ? projects.filter((p) => !p.isInbox) : labels)
        .filter((x) => x.name.toLowerCase().startsWith(suggest.query.toLowerCase()))
        .slice(0, 6)
    : [];

  function onChange(value: string, caret: number) {
    setText(value);
    const before = value.slice(0, caret);
    const m = before.match(/([#@])([\p{L}\p{N}_-]*)$/u);
    if (m) {
      setSuggest({ sigil: m[1] as '#' | '@', query: m[2]!, start: caret - m[0].length });
      setHi(0);
    } else {
      setSuggest(null);
    }
  }

  function pick(name: string) {
    if (!suggest) return;
    const tokenLen = 1 + suggest.query.length;
    const next = `${text.slice(0, suggest.start)}${suggest.sigil}${name} ${text.slice(suggest.start + tokenLen)}`;
    setText(next);
    setSuggest(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function submit() {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try {
      const task = await api.quickAdd(value);
      const patch: { projectId?: string; sectionId?: string } = {};
      if (defaultProjectId && !value.includes('#') && task.projectId !== defaultProjectId) {
        patch.projectId = defaultProjectId;
      }
      if (defaultSectionId) patch.sectionId = defaultSectionId;
      if (patch.projectId || patch.sectionId) await api.updateTask(task.id, patch);
      setText('');
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggest && items.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % items.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + items.length) % items.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(items[hi]!.name); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSuggest(null); return; }
    }
    if (e.key === 'Enter') void submit();
    if (e.key === 'Escape') setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted transition hover:text-brand"
      >
        <span className="text-lg leading-none text-brand">＋</span>
        {t('task.add')}
      </button>
    );
  }

  return (
    <div className="relative mt-2 rounded-lg border border-line p-3 shadow-sm focus-within:border-brand">
      <input
        ref={inputRef}
        autoFocus
        value={text}
        onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onKeyDown={onKeyDown}
        placeholder={t('task.addPlaceholder')}
        className="w-full text-sm text-ink outline-none placeholder:text-muted"
      />

      {suggest && items.length > 0 && (
        <ul className="absolute left-3 right-3 top-12 z-10 overflow-hidden rounded-md border border-line bg-surface shadow-lg">
          {items.map((it, i) => (
            <li key={it.id}>
              <button
                onMouseDown={(e) => { e.preventDefault(); pick(it.name); }}
                onMouseEnter={() => setHi(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === hi ? 'bg-brand-soft text-brand' : 'text-ink'}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: it.color ?? '#808080' }} />
                {suggest.sigil}{it.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted">{t('quickadd.hint')}</span>
        <div className="flex gap-2">
          <button
            onClick={() => { setOpen(false); setText(''); setSuggest(null); }}
            className="rounded-md px-3 py-1.5 text-sm text-ink hover:bg-line/60"
          >
            {t('task.cancel')}
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy || !text.trim()}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-hover disabled:opacity-50"
          >
            {t('task.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
