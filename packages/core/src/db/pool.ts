import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Format a JS number[] as a pgvector literal, e.g. [0.1,0.2]. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}
