import { config } from '../config.js';
import { getPool } from './pool.js';

interface Migration {
  id: string;
  sql: string;
}

/**
 * Migrations are defined inline (not loaded from .sql files) so they work
 * identically from `tsx src/...` in dev and from compiled `dist/...` in the
 * Docker image. The embedding vector dimension is injected from config.
 */
function migrations(): Migration[] {
  const dim = config.embeddingDim;
  return [
    {
      id: '001_init',
      sql: /* sql */ `
        CREATE EXTENSION IF NOT EXISTS vector;
        CREATE EXTENSION IF NOT EXISTS citext;

        CREATE TABLE IF NOT EXISTS users (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email         CITEXT UNIQUE NOT NULL,
          password_hash TEXT,
          google_sub    TEXT UNIQUE,
          display_name  TEXT,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          revoked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);

        CREATE TABLE IF NOT EXISTS api_keys (
          id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name         TEXT,
          key_hash     TEXT NOT NULL UNIQUE,
          prefix       TEXT NOT NULL,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_used_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id);

        CREATE TABLE IF NOT EXISTS tasks (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          parent_id   UUID REFERENCES tasks(id) ON DELETE CASCADE,
          title       TEXT NOT NULL,
          description TEXT,
          assignee    TEXT,
          due_date    TIMESTAMPTZ,
          status      TEXT NOT NULL DEFAULT 'todo',
          progress    SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
          position    INT NOT NULL DEFAULT 0,
          embedding   VECTOR(${dim}),
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS tasks_user_idx   ON tasks (user_id);
        CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (user_id, status);
        CREATE INDEX IF NOT EXISTS tasks_parent_idx ON tasks (parent_id);
        CREATE INDEX IF NOT EXISTS tasks_embedding_idx
          ON tasks USING hnsw (embedding vector_cosine_ops);
      `,
    },
    {
      // Todoist-style priority: 1 = P1 (urgent) … 4 = P4 (none / default).
      id: '002_task_priority',
      sql: /* sql */ `
        ALTER TABLE tasks
          ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 4
            CHECK (priority BETWEEN 1 AND 4);
        CREATE INDEX IF NOT EXISTS tasks_priority_idx ON tasks (user_id, priority);
      `,
    },
    {
      // Projects: the top-level containers for tasks. Every user has exactly one
      // special `is_inbox` project (the default landing spot for new tasks).
      id: '003_projects',
      sql: /* sql */ `
        CREATE TABLE IF NOT EXISTS projects (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name        TEXT NOT NULL,
          color       TEXT,
          parent_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
          is_inbox    BOOLEAN NOT NULL DEFAULT false,
          is_favorite BOOLEAN NOT NULL DEFAULT false,
          view_mode   TEXT NOT NULL DEFAULT 'list',
          position    INT NOT NULL DEFAULT 0,
          archived_at TIMESTAMPTZ,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS projects_user_idx ON projects (user_id);
        CREATE INDEX IF NOT EXISTS projects_parent_idx ON projects (parent_id);
        -- At most one inbox per user (also the ON CONFLICT target for ensureInbox).
        CREATE UNIQUE INDEX IF NOT EXISTS projects_one_inbox_idx
          ON projects (user_id) WHERE is_inbox;

        -- Backfill: give every existing user an Inbox.
        INSERT INTO projects (user_id, name, is_inbox)
          SELECT id, 'Inbox', true FROM users
          ON CONFLICT DO NOTHING;
      `,
    },
    {
      // Sections: ordered sub-divisions within a project; double as the columns
      // of the board (Kanban) view.
      id: '004_sections',
      sql: /* sql */ `
        CREATE TABLE IF NOT EXISTS sections (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name       TEXT NOT NULL,
          position   INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS sections_project_idx ON sections (project_id);
      `,
    },
    {
      // Link tasks to a project (required, defaults to Inbox) and an optional
      // section. Deleting a project deletes its tasks; deleting a section just
      // un-sections the tasks (they stay in the project).
      id: '005_task_project_section',
      sql: /* sql */ `
        ALTER TABLE tasks
          ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
          ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id) ON DELETE SET NULL;

        -- Backfill: move every existing task into its owner's Inbox.
        UPDATE tasks t SET project_id = p.id
          FROM projects p
          WHERE p.user_id = t.user_id AND p.is_inbox AND t.project_id IS NULL;

        CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks (project_id);
        CREATE INDEX IF NOT EXISTS tasks_section_idx ON tasks (section_id);
      `,
    },
    {
      // Labels: cross-project tags. `task_labels` is the many-to-many join.
      id: '006_labels',
      sql: /* sql */ `
        CREATE TABLE IF NOT EXISTS labels (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name       TEXT NOT NULL,
          color      TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        -- Label names are unique per user, case-insensitively.
        CREATE UNIQUE INDEX IF NOT EXISTS labels_user_name_idx
          ON labels (user_id, lower(name));

        CREATE TABLE IF NOT EXISTS task_labels (
          task_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
          PRIMARY KEY (task_id, label_id)
        );
        CREATE INDEX IF NOT EXISTS task_labels_label_idx ON task_labels (label_id);
      `,
    },
    {
      // Rich dates (Todoist-accurate): `due_date` stays the scheduled date that
      // drives Today/Upcoming; `deadline` is a separate hard date; `duration`
      // is the length of the calendar slot.
      id: '007_task_dates',
      sql: /* sql */ `
        ALTER TABLE tasks
          ADD COLUMN IF NOT EXISTS deadline DATE,
          ADD COLUMN IF NOT EXISTS duration_minutes INT
            CHECK (duration_minutes IS NULL OR duration_minutes > 0);
        CREATE INDEX IF NOT EXISTS tasks_deadline_idx ON tasks (user_id, deadline);
      `,
    },
    {
      // Recurrence: a canonical natural-language rule ("every weekday"). When a
      // recurring task is completed its due date advances to the next occurrence.
      id: '008_task_recurrence',
      sql: /* sql */ `
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;
      `,
    },
    {
      // Saved filters: a named filter-query (e.g. "(p1 | p2) & @work & 7 days").
      id: '009_filters',
      sql: /* sql */ `
        CREATE TABLE IF NOT EXISTS filters (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name       TEXT NOT NULL,
          query      TEXT NOT NULL,
          color      TEXT,
          position   INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS filters_user_idx ON filters (user_id);
      `,
    },
    {
      // AI activity log: every generative call (RAG "ask") records its prompt,
      // response and token usage for transparency and cost tracking.
      id: '010_ai_logs',
      sql: /* sql */ `
        CREATE TABLE IF NOT EXISTS ai_logs (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind          TEXT NOT NULL,
          model         TEXT,
          prompt        TEXT NOT NULL,
          response      TEXT,
          input_tokens  INT NOT NULL DEFAULT 0,
          output_tokens INT NOT NULL DEFAULT 0,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ai_logs_user_idx ON ai_logs (user_id, created_at DESC);
      `,
    },
    {
      // Completion tracking + Karma: a completed_at timestamp (the archive) and
      // an append-only ledger of karma points earned for completing tasks.
      id: '011_karma',
      sql: /* sql */ `
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
        UPDATE tasks SET completed_at = updated_at
          WHERE status = 'done' AND completed_at IS NULL;
        CREATE INDEX IF NOT EXISTS tasks_completed_idx ON tasks (user_id, completed_at);

        CREATE TABLE IF NOT EXISTS karma_events (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          points     INT NOT NULL,
          reason     TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS karma_events_user_idx ON karma_events (user_id, created_at);
      `,
    },
    {
      // Labels can be marked as favourites (pinned in the sidebar Favorites).
      id: '012_label_favorite',
      sql: /* sql */ `
        ALTER TABLE labels ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;
      `,
    },
    {
      // Attachments: text content attached to a task. The extracted text is
      // folded into the task's embedding so it is searchable by the RAG.
      id: '013_attachments',
      sql: /* sql */ `
        CREATE TABLE IF NOT EXISTS attachments (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          filename   TEXT NOT NULL,
          mime       TEXT,
          content    TEXT NOT NULL DEFAULT '',
          byte_size  INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS attachments_task_idx ON attachments (task_id);
      `,
    },
    {
      // External calendar feeds (an .ics URL over HTTP — incl. Google Calendar's
      // secret iCal address) whose events are merged into the calendar view.
      id: '014_calendar_sources',
      sql: /* sql */ `
        CREATE TABLE IF NOT EXISTS calendar_sources (
          id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name           TEXT NOT NULL,
          url            TEXT NOT NULL,
          color          TEXT,
          last_synced_at TIMESTAMPTZ,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS calendar_sources_user_idx ON calendar_sources (user_id);
      `,
    },
    {
      // Notes (OneNote-lite): notebooks contain pages. Pages hold plain/markdown
      // text content.
      id: '015_notes',
      sql: /* sql */ `
        CREATE TABLE IF NOT EXISTS notebooks (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name       TEXT NOT NULL,
          color      TEXT,
          position   INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS notebooks_user_idx ON notebooks (user_id);

        CREATE TABLE IF NOT EXISTS note_pages (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
          user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title       TEXT NOT NULL DEFAULT 'Untitled',
          content     TEXT NOT NULL DEFAULT '',
          position    INT NOT NULL DEFAULT 0,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS note_pages_notebook_idx ON note_pages (notebook_id);
      `,
    },
    {
      // Opt a note page into the RAG: its text is embedded and retrieved by the
      // semantic "ask" alongside tasks.
      id: '016_note_rag',
      sql: /* sql */ `
        ALTER TABLE note_pages ADD COLUMN IF NOT EXISTS in_rag BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE note_pages ADD COLUMN IF NOT EXISTS embedding VECTOR(${dim});
        CREATE INDEX IF NOT EXISTS note_pages_embedding_idx
          ON note_pages USING hnsw (embedding vector_cosine_ops);
      `,
    },
    {
      id: '017_note_page_color',
      sql: /* sql */ `ALTER TABLE note_pages ADD COLUMN IF NOT EXISTS color TEXT;`,
    },
    {
      id: '018_password_reset',
      sql: /* sql */ `
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at    TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS password_reset_user_idx
          ON password_reset_tokens (user_id);
      `,
    },
  ];
}

export async function migrate(): Promise<void> {
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
       id TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  for (const m of migrations()) {
    const { rowCount } = await pool.query('SELECT 1 FROM _migrations WHERE id = $1', [m.id]);
    if (rowCount) continue;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(m.sql);
      await client.query('INSERT INTO _migrations (id) VALUES ($1)', [m.id]);
      await client.query('COMMIT');
      console.log(`[migrate] applied ${m.id}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
