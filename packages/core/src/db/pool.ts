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

let unaccentOk: boolean | null = null;

/**
 * Whether the `unaccent` extension is installed (cached after the first check).
 * Lexical search uses it to fold accents ("conférence" ↔ "conference"); when it
 * isn't present (e.g. a managed Postgres without the contrib module) search
 * degrades to case-only folding instead of failing outright.
 */
export async function hasUnaccent(): Promise<boolean> {
  if (unaccentOk !== null) return unaccentOk;
  try {
    const { rows } = await getPool().query(`SELECT 1 FROM pg_extension WHERE extname = 'unaccent'`);
    unaccentOk = rows.length > 0;
  } catch {
    unaccentOk = false;
  }
  return unaccentOk;
}

/** SQL expression folding `col` to lowercase (and accent-free when available). */
export function foldExpr(col: string, unaccent: boolean): string {
  return unaccent ? `unaccent(lower(${col}))` : `lower(${col})`;
}
