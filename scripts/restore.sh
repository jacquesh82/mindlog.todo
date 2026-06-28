#!/usr/bin/env bash
# Restore a mindlog.todo backup (made by scripts/backup.sh) onto a clean build.
#
# Designed to run against a freshly-cloned / freshly-built checkout: it restores
# the secrets/config first, brings up ONLY the database, loads the dump, then
# starts the rest of the stack. The API runs its migrations on boot, which become
# a no-op because the dump already carries the schema and the _migrations ledger.
#
# Usage:
#   scripts/restore.sh backups/mindlog-backup-YYYYmmdd-HHMMSS.tar.gz
#   COMPOSE_FILE=docker-compose.prod.yml scripts/restore.sh <archive>
#
# Bring a vierge build to this point first:
#   git clone … && cd mindlog.todo
#   ./scripts/gen-certs.sh            # dev only (or restore certs/ from the backup)
#   ./scripts/restore.sh <archive>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: $0 <backup-archive.tar.gz>" >&2
  exit 1
fi
ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"

DB_SERVICE="${DB_SERVICE:-db}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ Extracting $(basename "$ARCHIVE")…"
tar -C "$WORK" -xzf "$ARCHIVE"
[ -f "$WORK/db.dump" ] || { echo "✗ Archive has no db.dump — not a mindlog backup." >&2; exit 1; }
[ -f "$WORK/MANIFEST.txt" ] && { echo "---"; cat "$WORK/MANIFEST.txt"; echo "---"; }

# Restore config/secrets first so the stack boots with the ORIGINAL keys.
# (ENCRYPTION_KEY must match the dump, or users' stored BYOK keys won't decrypt.)
if [ -f "$WORK/.env" ]; then
  if [ -f .env ] && ! cmp -s "$WORK/.env" .env; then
    cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"
    echo "  existing .env differs — backed up to .env.bak.*"
  fi
  cp "$WORK/.env" .env
  echo "  .env restored"
else
  echo "  ⚠ backup has no .env — keeping the current one (ensure ENCRYPTION_KEY matches the dump)"
fi
if [ -d "$WORK/certs" ]; then mkdir -p certs; cp -a "$WORK/certs/." certs/; echo "  certs/ restored"; fi

# DB name/user come from the (now-restored) .env.
read_env() { [ -f .env ] && grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }
PGUSER="$(read_env POSTGRES_USER)"; PGUSER="${PGUSER:-mindlog}"
PGDB="$(read_env POSTGRES_DB)"; PGDB="${PGDB:-mindlog}"

echo "→ Starting the database service only…"
docker compose up -d "$DB_SERVICE"

echo "  waiting for '$DB_SERVICE' to be healthy…"
for _ in $(seq 1 60); do
  cid="$(docker compose ps -q "$DB_SERVICE" 2>/dev/null)"
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
  if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then break; fi
  sleep 2
done

echo "→ Restoring database '$PGDB' (this drops and recreates existing objects)…"
docker compose exec -T "$DB_SERVICE" \
  pg_restore -U "$PGUSER" -d "$PGDB" --clean --if-exists --no-owner --no-acl < "$WORK/db.dump"

echo "→ Starting the rest of the stack…"
docker compose up -d

echo "✓ Restore complete. The API will run migrations as a no-op over the restored schema."
