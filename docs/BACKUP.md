# Backup & restore

All persistent state lives in PostgreSQL (see [STORAGE.md](./STORAGE.md)). A full
backup is therefore just **the database dump + the secrets needed to read it back**.
Two scripts handle this:

- `scripts/backup.sh` — writes a timestamped archive to `backups/`.
- `scripts/restore.sh` — restores an archive onto a clean build.

## What's in a backup

A backup archive (`backups/mindlog-backup-<timestamp>.tar.gz`) contains:

| File | Why it matters |
| --- | --- |
| `db.dump` | Custom-format `pg_dump` of the whole database — every task, note, attachment, embedding and account. |
| `.env` | Config **and secrets**. Two are critical: **`ENCRYPTION_KEY`** decrypts each user's stored BYOK provider key — restore the DB with a different key and those keys become unreadable. **`JWT_SECRET`** keeps existing sessions/refresh tokens valid. Also holds `POSTGRES_PASSWORD`, OAuth client secrets, etc. |
| `certs/` | Local dev TLS cert + mkcert root CA, if present. Regenerable with `scripts/gen-certs.sh`, so optional in prod. |

> The archive contains plaintext secrets and all user data. Keep it private and
> off version control — `backups/` is git-ignored.

## Create a backup

```bash
# Dev stack (uses docker-compose.yml + override)
./scripts/backup.sh

# Production stack
COMPOSE_FILE=docker-compose.prod.yml ./scripts/backup.sh
```

The `db` service must be running. The script reads the database name/user from
`.env` (falling back to the `mindlog` defaults).

## Restore onto a clean / vierge build

Starting from nothing (fresh clone, empty Docker volumes):

```bash
git clone <repo> && cd mindlog.todo

# Dev only: trust a local TLS cert (or let restore.sh drop the backed-up certs/ in)
./scripts/gen-certs.sh

# Restore: brings up the db, loads the dump, then starts the full stack
./scripts/restore.sh backups/mindlog-backup-<timestamp>.tar.gz

# Production
COMPOSE_FILE=docker-compose.prod.yml ./scripts/restore.sh <archive>
```

What `restore.sh` does, in order:

1. Extracts the archive.
2. Restores `.env` (backing up any existing one to `.env.bak.*` if it differs)
   and `certs/`, so the stack boots with the **original** secrets.
3. Brings up **only** the `db` service and waits for it to be healthy.
4. Runs `pg_restore --clean --if-exists` into the database — dropping and
   recreating objects so it works whether the DB is empty or already populated.
5. Starts the rest of the stack. The API runs its migrations on boot; because the
   dump already carries the schema and the `_migrations` ledger, this is a no-op.

## Verify a backup without restoring

List the dump's contents (read-only, touches nothing):

```bash
tar -xzOf backups/mindlog-backup-<timestamp>.tar.gz ./db.dump \
  | docker compose exec -T db pg_restore --list | grep "TABLE DATA"
```

## Notes & caveats

- **Keep `.env` and `db.dump` together.** The same `ENCRYPTION_KEY` must be used,
  or restored BYOK keys can't be decrypted (users would simply re-enter them in
  Settings → AI; nothing else breaks).
- **Embedding dimension** (`EMBEDDING_DIM`) must match the dump. Changing the
  embedding provider/dimension requires re-embedding, not a restore.
- **Scheduling**: run `scripts/backup.sh` from cron for periodic backups, e.g.
  a daily entry that also prunes old archives:
  ```
  0 3 * * *  cd /opt/mindlog.todo && ./scripts/backup.sh && find backups -name '*.tar.gz' -mtime +14 -delete
  ```
- **Restore is destructive** to the target database — it drops existing objects.
  Restore into a fresh stack, or take a backup first.
