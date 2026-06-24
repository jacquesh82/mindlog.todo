import { useState } from 'react';
import { api, type TaskInput } from '../api/client';
import { TASK_STATUSES, type Task, type TaskStatus } from '../types';

interface Props {
  task: Task;
  reload: () => void;
}

export function TaskNode({ task, reload }: Props) {
  const [editing, setEditing] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [subTitle, setSubTitle] = useState('');
  const [draft, setDraft] = useState<TaskInput>({
    title: task.title,
    description: task.description,
    assignee: task.assignee,
    dueDate: task.dueDate,
  });

  async function patch(p: Partial<TaskInput>) {
    await api.updateTask(task.id, p);
    reload();
  }

  async function saveEdit() {
    await api.updateTask(task.id, draft);
    setEditing(false);
    reload();
  }

  async function addSub() {
    if (!subTitle.trim()) return;
    await api.createTask({ title: subTitle.trim(), parentId: task.id });
    setSubTitle('');
    setAddingSub(false);
    reload();
  }

  async function remove() {
    if (confirm(`Delete "${task.title}" and its sub-tasks?`)) {
      await api.deleteTask(task.id);
      reload();
    }
  }

  return (
    <li className="task-node">
      <div className={`task-row status-${task.status}`}>
        {editing ? (
          <div className="edit-form">
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <textarea
              placeholder="Description"
              value={draft.description ?? ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
            <input
              placeholder="Assignee (who)"
              value={draft.assignee ?? ''}
              onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
            />
            <input
              type="datetime-local"
              value={draft.dueDate ? draft.dueDate.slice(0, 16) : ''}
              onChange={(e) =>
                setDraft({ ...draft, dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })
              }
            />
            <div className="row-actions">
              <button onClick={saveEdit}>Save</button>
              <button className="link" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="task-main">
              <span className="task-title">{task.title}</span>
              {task.assignee && <span className="chip">👤 {task.assignee}</span>}
              {task.dueDate && (
                <span className="chip">📅 {new Date(task.dueDate).toLocaleDateString()}</span>
              )}
            </div>
            {task.description && <div className="task-desc">{task.description}</div>}
            <div className="task-controls">
              <select
                value={task.status}
                onChange={(e) => patch({ status: e.target.value as TaskStatus })}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <label className="progress">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={task.progress}
                  onChange={(e) => patch({ progress: Number(e.target.value) })}
                />
                <span>{task.progress}%</span>
              </label>
              <button className="link" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button className="link" onClick={() => setAddingSub((v) => !v)}>
                + Sub-task
              </button>
              <button className="link danger" onClick={remove}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      {addingSub && (
        <div className="add-sub">
          <input
            placeholder="Sub-task title"
            value={subTitle}
            autoFocus
            onChange={(e) => setSubTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSub()}
          />
          <button onClick={addSub}>Add</button>
        </div>
      )}

      {task.children && task.children.length > 0 && (
        <ul className="task-children">
          {task.children.map((c) => (
            <TaskNode key={c.id} task={c} reload={reload} />
          ))}
        </ul>
      )}
    </li>
  );
}
