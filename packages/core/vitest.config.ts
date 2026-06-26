import { defineConfig } from 'vitest/config';

// Core hosts pure-domain unit tests (parsers, schemas, recurrence math) that need
// neither a database nor network. Anything requiring Postgres lives in the
// server package's integration suite instead.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
