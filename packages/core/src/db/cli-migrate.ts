import { closePool } from './pool.js';
import { migrate } from './migrate.js';

migrate()
  .then(() => {
    console.log('[migrate] done');
  })
  .catch((err) => {
    console.error('[migrate] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
