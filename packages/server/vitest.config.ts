import { defineConfig } from 'vitest/config';

// Test environment: a dedicated database and the deterministic `fake` embedding
// provider (no model download / network). These are set on the main process so
// both the globalSetup and the test workers see them.
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'postgres://mindlog:mindlog@localhost:5439/mindlog_test',
  EMBEDDING_PROVIDER: 'fake',
  EMBEDDING_DIM: '64',
  JWT_SECRET: 'test-secret',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '1d',
};
Object.assign(process.env, TEST_ENV);

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    env: TEST_ENV,
    // One DB, shared across files — run serially to avoid truncation races.
    fileParallelism: false,
    pool: 'forks',
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
