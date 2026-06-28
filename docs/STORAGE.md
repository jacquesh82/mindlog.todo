# Storage: where notes and tasks live

**Short answer: everything is in PostgreSQL.** mindlog.todo has no separate file
store, object bucket, or local disk for user content. Tasks, notes, attachments
(including pasted images) and their search embeddings are all rows/columns in one
Postgres database. Backing up the database backs up everything.

## What is stored where

| Data | Table(s) | Notes |
| --- | --- | --- |
| Tasks | `tasks` | Title, description, dates, status, priority, recurrence, hierarchy. |
| Task ↔ label links | `task_labels` | Join table. |
| Projects / sections / labels / filters | `projects`, `sections`, `labels`, `filters` | Organisational structure. |
| Notebooks & note pages | `notebooks`, `note_pages` | A page's rich-text content is one `content` column (JSON of positioned boxes). |
| Attachments | `attachments` | File `content` is stored inline in the row; `byte_size` records its size. |
| Pasted images in notes | `note_pages.content` | Embedded as base64 `data:` URLs **inside** the page content — they are not separate files. |
| AI activity / usage | `ai_logs` | Prompt, response and token counts per generative call. |
| Karma events | `karma_events` | Productivity scoring history. |
| Calendar subscriptions | `calendar_sources`, `mindlog_id_connections` | External feeds are fetched live, not stored as events. |
| Accounts, auth, API keys, OAuth | `users`, `refresh_tokens`, `password_reset_tokens`, `api_keys`, `oauth_*`, `user_ai_settings` | Self-hosted AI keys are stored **encrypted** in `user_ai_settings`. |

### Search embeddings (RAG)

Semantic search vectors are **columns on the same rows**, via the `pgvector`
extension — not a separate vector database:

- `tasks.embedding VECTOR(n)` — every task (folds in its attachments' text).
- `note_pages.embedding VECTOR(n)` — only pages the user opted into AI search
  (`note_pages.in_rag = true`).

Both use HNSW indexes for nearest-neighbour lookup.

## How storage usage is measured

Per-user byte counts come from `octet_length`/`byte_size` aggregates:

- Notes: `SELECT sum(octet_length(content)) FROM note_pages WHERE user_id = $1`
  (`repository/note.repo.ts:userContentBytes`).
- Attachments: `SELECT sum(byte_size) FROM attachments WHERE user_id = $1`
  (`repository/attachment.repo.ts:userContentBytes`).

`service/storage.service.ts:getStorageUsage` sums these and is exposed at
`GET /api/v1/storage`. Settings → Data renders it as a usage bar.

## Quotas and hosting mode

- **Notes quota:** `USER_NOTES_QUOTA = 100 MB` per account
  (`domain/note.ts`). Enforced only in **self-hosted** mode — it protects the
  instance's database. In **cloud-hosted** mode storage is managed by the
  workspace, so the cap is not enforced; the Settings card shows raw consumption.
- **Hosting mode** is determined by `cloudHosted()` (`config.ts`): cloud-hosted
  when the server has a shared `AI_CHAT_API_KEY`, otherwise self-hosted. The mode
  is surfaced in Settings → About and via `GET /api/v1/ai/settings`.
- **AI usage** is metered separately from storage, in tokens, against a monthly
  allowance (`ai_logs` + `service/ai-log.service.ts`) — not disk bytes.
