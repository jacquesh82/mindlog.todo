import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { QuickAdd } from '../components/QuickAdd';
import { SortBar } from '../components/SortBar';
import { TaskEditor } from '../components/TaskEditor';
import { TaskRow } from '../components/TaskRow';
import { useI18n } from '../i18n';
import { buildTree, sortTree, type SortMode, type TreeTask } from '../tree';
import type { Label, Project, ProjectViewMode, Section, Task } from '../types';

interface Props {
  project: Project;
  projects: Project[];
  labels: Label[];
  onDataChanged: () => void;
}

const NO_SECTION = '__none__';

export function ProjectView({ project, projects, labels, onDataChanged }: Props) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ProjectViewMode>(project.viewMode);
  const [editing, setEditing] = useState<TreeTask | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [sort, setSort] = useState<SortMode>('manual');
  const [showCompleted, setShowCompleted] = useState(false);

  const labelMap = new Map(labels.map((l) => [l.id, l]));

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.listTasks(showCompleted ? { projectId: project.id } : { projectId: project.id, completed: 'false' }),
      api.listSections(project.id),
    ])
      .then(([ts, ss]) => {
        setTasks(ts);
        setSections(ss);
      })
      .finally(() => setLoading(false));
  }, [project.id, showCompleted]);

  useEffect(() => {
    setMode(project.viewMode);
  }, [project.id, project.viewMode]);
  useEffect(() => reload(), [reload]);

  const changed = () => {
    reload();
    onDataChanged();
  };

  async function setViewMode(next: ProjectViewMode) {
    setMode(next);
    await api.updateProject(project.id, { viewMode: next });
  }

  async function addSection() {
    if (!sectionName.trim()) return;
    await api.createSection(project.id, sectionName.trim(), sections.length);
    setSectionName('');
    setAddingSection(false);
    reload();
  }

  // Build the sub-task tree, sort, then group the ROOT tasks by section.
  const roots = sortTree(buildTree(tasks), sort);
  const groups: { id: string; section: Section | null; tasks: TreeTask[] }[] = [
    { id: NO_SECTION, section: null, tasks: roots.filter((t) => !t.sectionId) },
    ...sections.map((s) => ({ id: s.id, section: s, tasks: roots.filter((t) => t.sectionId === s.id) })),
  ];

  return (
    <div className={`w-full px-8 py-8 ${mode === 'board' ? '' : 'mx-auto max-w-3xl'}`}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color ?? '#808080' }} />
          {project.isInbox ? t('nav.inbox') : project.name}
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <SortBar sort={sort} onSort={setSort} showCompleted={showCompleted} onToggleCompleted={() => setShowCompleted((v) => !v)} />
          <div className="flex items-center gap-1">
            {(['list', 'board'] as ProjectViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => void setViewMode(m)}
                className={`rounded-md border px-2 py-1 ${mode === m ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted'}`}
              >
                {m === 'list' ? `☰ ${t('view.list')}` : `▤ ${t('view.board')}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : mode === 'board' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {groups.map((g) => (
            <div key={g.id} className="w-72 shrink-0">
              <div className="mb-2 text-sm font-semibold text-ink">
                {g.section ? g.section.name : t('section.none')}{' '}
                <span className="text-muted">{g.tasks.length}</span>
              </div>
              <ul className="rounded-lg border border-line p-2">
                {g.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} labels={labelMap} onChanged={changed} onEdit={setEditing} />
                ))}
              </ul>
              <QuickAdd defaultProjectId={project.id} defaultSectionId={g.section?.id} onAdded={changed} />
            </div>
          ))}
          <AddSectionColumn
            adding={addingSection}
            name={sectionName}
            setName={setSectionName}
            setAdding={setAddingSection}
            onAdd={addSection}
          />
        </div>
      ) : (
        <div>
          {groups.map((g) => (
            <div key={g.id} className="mb-4">
              {g.section && (
                <div className="mb-1 border-b border-line pb-1 text-sm font-semibold text-ink">
                  {g.section.name} <span className="text-muted">{g.tasks.length}</span>
                </div>
              )}
              <ul>
                {g.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} labels={labelMap} onChanged={changed} onEdit={setEditing} />
                ))}
              </ul>
              <QuickAdd defaultProjectId={project.id} defaultSectionId={g.section?.id} onAdded={changed} />
            </div>
          ))}
          <div className="mt-2">
            {addingSection ? (
              <input
                autoFocus
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addSection();
                  if (e.key === 'Escape') setAddingSection(false);
                }}
                onBlur={() => setAddingSection(false)}
                placeholder={t('section.name')}
                className="w-full rounded border border-line px-2 py-1 text-sm outline-none focus:border-brand"
              />
            ) : (
              <button onClick={() => setAddingSection(true)} className="text-sm text-muted hover:text-brand">
                ＋ {t('section.add')}
              </button>
            )}
          </div>
        </div>
      )}

      {editing && (
        <TaskEditor task={editing} projects={projects} labels={labels} onClose={() => setEditing(null)} onSaved={changed} />
      )}
    </div>
  );
}

function AddSectionColumn({
  adding,
  name,
  setName,
  setAdding,
  onAdd,
}: {
  adding: boolean;
  name: string;
  setName: (v: string) => void;
  setAdding: (v: boolean) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="w-72 shrink-0">
      {adding ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAdd();
            if (e.key === 'Escape') setAdding(false);
          }}
          onBlur={() => setAdding(false)}
          placeholder={t('section.name')}
          className="w-full rounded border border-line px-2 py-1 text-sm outline-none focus:border-brand"
        />
      ) : (
        <button onClick={() => setAdding(true)} className="text-sm text-muted hover:text-brand">
          ＋ {t('section.add')}
        </button>
      )}
    </div>
  );
}
