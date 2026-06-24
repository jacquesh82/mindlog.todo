import pg from 'pg';

/** Create the dedicated test database (idempotent) before any test runs. */
export async function setup(): Promise<void> {
  const url = new URL(
    process.env.DATABASE_URL ?? 'postgres://mindlog:mindlog@localhost:5439/mindlog_test',
  );
  const testDb = url.pathname.slice(1);
  url.pathname = '/postgres'; // connect to the maintenance db to issue CREATE DATABASE

  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDb]);
  if (!exists.rowCount) {
    await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(testDb)}`);
  }
  await admin.end();
}
