import { getPool, migrate } from '@mindlog/core';

/** Apply migrations once for the test database. */
export async function ensureSchema(): Promise<void> {
  await migrate();
}

/** Wipe all data between tests. */
export async function resetDb(): Promise<void> {
  await getPool().query(
    'TRUNCATE karma_events, ai_logs, filters, task_labels, labels, sections, projects, tasks, api_keys, refresh_tokens, users RESTART IDENTITY CASCADE',
  );
}
