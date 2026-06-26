import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/**
 * Load a `.env` file from the first candidate that exists, walking up from the
 * current working directory. This makes `npm run` from a workspace package and
 * `docker compose` (env already injected) both work. In Docker the env vars are
 * provided directly, so a missing file is fine.
 */
function loadEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(here, '../../../.env'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      dotenv.config({ path });
      return;
    }
  }
}

loadEnv();

function env(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

function intEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export type EmbeddingProviderId = 'local' | 'voyage' | 'openai' | 'fake';

export const config = {
  port: intEnv('PORT', 8080),
  publicUrl: env('PUBLIC_URL', 'http://localhost:8080'),
  webUrl: env('WEB_URL', 'http://localhost:5173'),
  databaseUrl: env('DATABASE_URL', 'postgres://mindlog:mindlog@localhost:5432/mindlog'),

  embeddingProvider: (env('EMBEDDING_PROVIDER', 'local') as EmbeddingProviderId),
  embeddingDim: intEnv('EMBEDDING_DIM', 384),
  voyageApiKey: env('VOYAGE_API_KEY'),
  openaiApiKey: env('OPENAI_API_KEY'),

  anthropicApiKey: env('ANTHROPIC_API_KEY'),
  askModel: env('ASK_MODEL', 'claude-sonnet-4-6'),

  jwtSecret: env('JWT_SECRET', 'dev-only-change-me'),
  jwtAccessTtl: env('JWT_ACCESS_TTL', '15m'),
  jwtRefreshTtl: env('JWT_REFRESH_TTL', '30d'),

  google: {
    clientId: env('GOOGLE_CLIENT_ID'),
    clientSecret: env('GOOGLE_CLIENT_SECRET'),
    redirectUri: env('GOOGLE_REDIRECT_URI', 'http://localhost:8080/api/v1/auth/google/callback'),
  },

  // Central mindlog identity provider (OIDC) — "Sign in with mindlog id".
  mindlogId: {
    issuer: env('MINDLOG_ID_ISSUER', 'https://id.mindlog.today'),
    clientId: env('MINDLOG_ID_CLIENT_ID'),
    clientSecret: env('MINDLOG_ID_CLIENT_SECRET'),
    redirectUri: env(
      'MINDLOG_ID_REDIRECT_URI',
      'http://localhost:8080/api/v1/auth/mindlog-id/callback',
    ),
  },

  // Outbound email (password reset, etc.) — MJML templates sent over SMTP.
  smtp: {
    host: env('SMTP_HOST'),
    port: intEnv('SMTP_PORT', 587),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    secure: env('SMTP_SECURE') === 'true',
    from: env('MAIL_FROM', 'mindlog <no-reply@mindlog.today>'),
  },
  passwordResetTtl: env('PASSWORD_RESET_TTL', '1h'),
} as const;

export function googleEnabled(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

export function mindlogIdEnabled(): boolean {
  return Boolean(config.mindlogId.clientId && config.mindlogId.clientSecret);
}

export function mailEnabled(): boolean {
  return Boolean(config.smtp.host);
}
