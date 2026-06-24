import { getPool, migrate } from '@mindlog/core';

/** Apply migrations once for the test database. */
export async function ensureSchema(): Promise<void> {
  await migrate();
}

/** Wipe all data between tests. */
export async function resetDb(): Promise<void> {
  await getPool().query('TRUNCATE tasks, api_keys, refresh_tokens, users RESTART IDENTITY CASCADE');
}
