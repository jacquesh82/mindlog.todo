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
