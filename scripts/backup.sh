#!/usr/bin/env bash
# Back up the mindlog.todo stack into a single timestamped archive.
#
# All persistent user data lives in PostgreSQL (tasks, notes, attachments,
# embeddings — see docs/STORAGE.md), so a database dump + the secrets/config
# needed to bring a fresh build back online is everything required to restore.
# We capture:
#   - db.dump   : custom-format pg_dump of the database
#   - .env      : config + API keys. CRITICAL: ENCRYPTION_KEY decrypts users'
#                 stored BYOK provider keys, and JWT_SECRET keeps sessions valid.
#                 Without the SAME .env a restore loads rows it cannot decrypt.
#   - certs/    : local dev TLS certs, if present (regenerable via gen-certs.sh)
#
# Usage:
#   scripts/backup.sh                                  # running dev stack
#   COMPOSE_FILE=docker-compose.prod.yml scripts/backup.sh   # prod stack
#
# Restore an archive onto a clean build with scripts/restore.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DB_SERVICE="${DB_SERVICE:-db}"

# Database name/user: prefer values in .env, fall back to the compose defaults.
read_env() { [ -f .env ] && grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }
PGUSER="${POSTGRES_USER:-$(read_env POSTGRES_USER)}"; PGUSER="${PGUSER:-mindlog}"
PGDB="${POSTGRES_DB:-$(read_env POSTGRES_DB)}"; PGDB="${PGDB:-mindlog}"

if ! docker compose ps "$DB_SERVICE" --status running >/dev/null 2>&1 \
   || [ -z "$(docker compose ps -q "$DB_SERVICE" 2>/dev/null)" ]; then
  echo "✗ The '$DB_SERVICE' service is not running. Start it first (docker compose up -d $DB_SERVICE)." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$ROOT/backups"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT_DIR"

echo "→ Dumping database '$PGDB' (user '$PGUSER')…"
docker compose exec -T "$DB_SERVICE" pg_dump -U "$PGUSER" -d "$PGDB" -Fc > "$WORK/db.dump"

echo "→ Copying secrets / config…"
if [ -f .env ]; then cp .env "$WORK/.env"; else echo "  (no .env found — skipping)"; fi
if [ -d certs ] && [ -n "$(ls -A certs 2>/dev/null)" ]; then
  mkdir -p "$WORK/certs"; cp -a certs/. "$WORK/certs/"
fi

cat > "$WORK/MANIFEST.txt" <<EOF
mindlog.todo backup
created:   $STAMP
database:  $PGDB (custom-format pg_dump -Fc)
includes:  db.dump$( [ -f "$WORK/.env" ] && printf ', .env' )$( [ -d "$WORK/certs" ] && printf ', certs/' )
restore:   scripts/restore.sh <this-archive>
EOF

ARCHIVE="$OUT_DIR/mindlog-backup-$STAMP.tar.gz"
tar -C "$WORK" -czf "$ARCHIVE" .
echo "✓ Backup written:"
ls -lh "$ARCHIVE"
echo
echo "Keep this archive private — it contains your secrets and all user data."
