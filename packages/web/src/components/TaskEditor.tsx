import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { PRIORITY_COLOR } from '../format';
import { useI18n } from '../i18n';
import type { Attachment, Label, Project, Section, Task } from '../types';

interface Props {
  task: Task;
  projects: Project[];
  labels: Label[];
  onClose: () => void;
  onSaved: () => void;
}

/** ISO → value for <input type="datetime-local"> in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskEditor({ task, projects, labels, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState(task.priority);
  const [due, setDue] = useState(toLocalInput(task.dueDate));
  const [deadline, setDeadline] = useState(task.deadline ?? '');
  const [projectId, setProjectId] = useState(task.projectId ?? '');
  const [sectionId, setSectionId] = useState(task.sectionId ?? '');
  const [sections, setSections] = useState<Section[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>(task.labelIds);
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAttachments = () => void api.listAttachments(task.id).then(setAttachments);
  useEffect(loadAttachments, [task.id]);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const content = await file.text();
      await api.addAttachment(task.id, { filename: file.name, mime: file.type || undefined, content });
    }
    if (fileRef.current) fileRef.current.value = '';
    loadAttachments();
  }

  // Load the chosen project's sections; clear the section if it no longer fits.
  useEffect(() => {
    if (!projectId) {
      setSections([]);
      return;
    }
    let alive = true;
    void api.listSections(projectId).then((ss) => {
      if (!alive) return;
      setSections(ss);
      setSectionId((cur) => (ss.some((s) => s.id === cur) ? cur : ''));
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  function toggleLabel(id: string) {
    setLabelIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function save() {
    setBusy(true);
    try {
      await api.updateTask(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate: due ? new Date(due).toISOString() : null,
        deadline: deadline || null,
        projectId: projectId || undefined,
        sectionId: sectionId || null,
        labelIds,
      });
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-line bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-base font-medium text-ink outline-none"
          placeholder={t('task.add')}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          className="mt-2 w-full resize-none rounded-md border border-line p-2 text-sm text-ink outline-none focus:border-brand"
          rows={3}
        />

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Field label="Priority">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 rounded-md border py-1 ${priority === p ? 'border-brand bg-brand-soft' : 'border-line'}`}
                  style={{ color: PRIORITY_COLOR[p] }}
                >
                  P{p}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Project">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-ink outline-none focus:border-brand"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.isInbox ? t('nav.inbox') : p.name}
                </option>
              ))}
            </select>
          </Field>
          {sections.length > 0 && (
            <Field label={t('section.name')}>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-ink outline-none focus:border-brand"
              >
                <option value="">{t('section.none')}</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Due date">
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-ink outline-none focus:border-brand"
            />
          </Field>
          <Field label="Deadline">
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-ink outline-none focus:border-brand"
            />
          </Field>
        </div>

        {labels.length > 0 && (
          <Field label="Labels">
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => (
                <button
                  key={l.id}
                  onClick={() => toggleLabel(l.id)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${labelIds.includes(l.id) ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted'}`}
                >
                  @{l.name}
                </button>
              ))}
            </div>
          </Field>
        )}

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted">{t('attach.title')}</span>
            <button onClick={() => fileRef.current?.click()} className="text-xs text-brand hover:underline">
              ＋ {t('attach.add')}
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
          </div>
          {attachments.length === 0 ? (
            <p className="text-xs text-muted">{t('attach.hint')}</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-2 py-1 text-xs">
                  <span className="flex-1 truncate text-ink">📎 {a.filename}</span>
                  <span className="text-muted">{Math.max(1, Math.round(a.byteSize / 1024))} KB</span>
                  <button
                    onClick={() => void api.deleteAttachment(a.id).then(loadAttachments)}
                    className="text-muted hover:text-[var(--color-p1)]"
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-ink hover:bg-line/60">
            {t('task.cancel')}
          </button>
          <button
            onClick={() => void save()}
            disabled={busy || !title.trim()}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {t('task.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
