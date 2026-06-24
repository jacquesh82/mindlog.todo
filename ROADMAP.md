# mindlog.todo — Todoist-Parity Roadmap

Phased plan to evolve the current app into a Todoist-class task manager.
**Status: plan for review — no code written yet.**

Scope chosen: **everything achievable in this self-hosted stack, including
integrations.** Native voice assistants, smartwatch apps, and OS-store packaging
are out of scope (see [§11](#11-explicitly-out-of-scope)).

---

## Where we are today

| Layer | Stack | What exists |
|---|---|---|
| `packages/core` | TS + Zod domain, services, repos | `Task` (id, parentId, title, description, assignee, dueDate, status, progress, position), hierarchical sub-tasks, pgvector embeddings, RAG ask |
| `packages/server` | Express REST + **MCP server** + **OpenAPI** | `/api/v1/tasks` CRUD/search/ask, JWT auth, **API keys**, Google OAuth scaffold |
| `packages/web` | React SPA | List/tree view, create, status filter, semantic search + ask panels |
| DB | Postgres 16 + pgvector | One `tasks` table; **inline append-only migrations** in `db/migrate.ts` |

**Key reusable foundations already in place:** API-key auth (`api_keys` table),
an MCP server (`server/src/mcp`), OpenAPI docs at `/docs`, Google OAuth
(`core/src/auth/google.ts`), and a clean repo/service split. These materially
shrink the collaboration and integration phases.

**Migration model to follow throughout:** append a new `{ id: '00N_x', sql }`
object to the array in `packages/core/src/db/migrate.ts`. Idempotent
(`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`), runs on server start. No separate
migration files.

Effort key: **S** ≈ ½–1 day · **M** ≈ 2–3 days · **L** ≈ ~1 week · **XL** ≈ 2+ weeks.

---

## Phase 1 — Data-model foundation  *(blocks everything; do first)*

The spine. Every later phase reads these tables.

### 1a. Projects & Sections — **L**
- **DB (`002`)**: `projects (id, user_id, name, color, parent_id, is_inbox, is_favorite, view_mode, position, archived_at)`; `sections (id, project_id, name, position)`. Add `tasks.project_id`, `tasks.section_id`. Backfill: create one Inbox project per user, point existing tasks at it.
- **Core**: `domain/project.ts`, `domain/section.ts` (Zod), `project.repo.ts`, `project.service.ts`. Extend task schemas with `projectId`/`sectionId`.
- **Server**: `projects.routes.ts` (CRUD, archive, reorder), section sub-routes; add MCP tools + OpenAPI paths.
- **Web**: project sidebar (tree, favorites, Inbox pinned), project picker on tasks, section grouping.
- *Inbox* (spec "Boîte de réception") = the auto-created `is_inbox` project.

### 1b. Priorities P1–P4 — **S**
- **DB (`003`)**: `tasks.priority SMALLINT NOT NULL DEFAULT 4` (1=P1 urgent … 4=none).
- Wire through Zod, repo `COLS`, REST, UI (colored flag + sort).

### 1c. Labels — **M**
- **DB (`004`)**: `labels (id, user_id, name, color)`; `task_labels (task_id, label_id)` join. Cross-project tags, used later by filters.
- **Core/Server**: `label.repo`/`service`, `labels.routes.ts`, attach/detach on tasks; include labels in task payloads.
- **Web**: label chips, label manager, `@label` autocomplete.

### 1d. Rich date model — **M**
- **DB (`005`)**: rename/extend — keep `due_date` as the **deadline**, add `start_date TIMESTAMPTZ`, `duration_minutes INT`, `is_all_day BOOL`. (Spec: distinct *date de début* vs *deadline* vs *durée*.)
- Update domain, repo, REST; UI date picker with start/deadline/duration + all-day toggle.

### 1e. Recurrence engine — **L**
- **DB (`006`)**: `tasks.recurrence_rule TEXT` (RRULE-ish or natural-language source), `tasks.recurrence_tz`.
- **Core**: `domain/recurrence.ts` — parse "every monday", "1st of each month", "every weekday", "every 3 days". Use `rrule` lib + a NL→RRULE mapper. On task completion, compute next occurrence and spawn/advance.
- **Tests**: recurrence is bug-prone — unit-test the NL parser and next-occurrence math hard.

> **Embedding note:** none of these change `taskEmbeddingText` except optionally
> folding project/label names into the embedded text for better RAG. Decide in 1c.

---

## Phase 2 — Capture & natural-language Quick Add — **L**

The headline Todoist feature.

- **Core**: `domain/quickadd.ts` — a parser turning
  `"submit report friday 4pm #work /Section p1 @home every fri"` into a
  structured `TaskCreateInput`. Tokens: `#project`, `/section`, `@label`,
  `p1–p4`, `!`+dates, recurrence phrases. Date parsing via `chrono-node`.
- **Server**: `POST /api/v1/tasks/parse` (preview) + accept raw string on create.
- **Web**: a global **Quick Add** modal (keyboard shortcut, e.g. `q`) with live
  parse preview (highlighted tokens). Available from every view.
- Depends on Phase 1 (projects/labels/priority/recurrence) existing to resolve tokens.

*Voice capture* (Siri/Assistant/Alexa) is out of scope; the **Web Speech API**
mic-to-text into Quick Add is a cheap in-browser stand-in — optional **S** add-on.

---

## Phase 3 — Views & filters — **XL**

- **Today** — tasks with due/deadline ≤ today (+ overdue). **S**
- **Upcoming** — rolling 7-day / agenda. **M**
- **Inbox** — already from 1a. **S**
- **Board (Kanban)** — columns by section or status; drag-and-drop reorder
  (reuses `position`). **L** (DnD lib, e.g. `@dnd-kit`).
- **Calendar** — month/week grid using start/deadline/duration. **L**.
- **Custom filters & query language** — the big one. **L**
  - **DB (`007`)**: `filters (id, user_id, name, query, color)`.
  - **Core**: a small parser/evaluator for the Todoist-style grammar:
    `(p1 | p2) & @work & 7 days`, `#Project`, `no date`, `overdue`, `assigned to: me`.
    Compile to SQL `WHERE` (preferred) or in-memory predicate.
  - **Web**: saved filters in sidebar, filter editor with validation.
- Per-project saved **view mode** (list/board/calendar) from `projects.view_mode`.

---

## Phase 4 — Reminders & notifications — **L**

- **DB (`008`)**: `reminders (id, task_id, user_id, type, remind_at, offset_minutes, location, delivered_at)`. Types: absolute, relative-to-due, location.
- **Core**: a scheduler. Two options —
  1. **In-process** `setInterval` sweep every minute (simplest; fine single-instance).
  2. **pg-based queue** (`SELECT … FOR UPDATE SKIP LOCKED`) for durability.
  → Recommend option 2 (durable, survives restarts).
- **Delivery channels**: Web Push (VAPID) for browser/PWA; email (reuse SMTP if
  added); in-app bell. Push needs a service worker (ties into Phase 9 PWA).
- **Location reminders (geofencing)** — only meaningful in a mobile/PWA context;
  implement as PWA geofence-on-foreground best-effort. Flag as partial vs native.

---

## Phase 5 — Collaboration — **XL**

Leverages existing multi-user auth.

- **DB (`009`)**: `project_members (project_id, user_id, role)` (owner/admin/member);
  `comments (id, task_id, user_id, body, created_at)`; `attachments (id, comment_id|task_id, filename, blob_ref, mime)`;
  `activity (id, project_id, task_id, actor_id, kind, payload, created_at)`;
  `notifications (id, user_id, kind, payload, read_at)`.
- **Permissions**: introduce a project-scoped authorization layer in services
  (currently auth is per-user `userId(req)`); every task/project query must check
  membership. This is the riskiest refactor — touches all existing routes.
- **Assignment**: change `tasks.assignee` (free text) → `assignee_id UUID` FK to a
  project member (`010`, with backfill/keep-text fallback).
- **Comments + @mentions**: mention parsing → notification rows.
- **Sharing**: invite by email (reuse user lookup / invite token), accept flow.
- **File attachments**: store in DB blob or object storage (the stack already runs
  a RustFS/S3-style service in the broader environment — or add a `storage`
  abstraction). **M** on its own.
- **Web**: member avatars, assignee picker, comment thread, activity feed, share dialog, notification center.

---

## Phase 6 — Productivity & gamification — **L**

- **DB (`011`)**: `tasks.completed_at`; `karma_events (user_id, kind, points, created_at)`;
  optional `daily_stats (user_id, day, completed, added)` rollup.
- **Karma**: points on completion/streak, penalties for overdue; levels
  (Beginner → … → Grandmaster). Daily/weekly goals + streak counter.
- **Completed archive**: query `completed_at IS NOT NULL`; "Activity" log view.
- **Productivity view**: charts (daily/weekly trends) — a chart lib in web.
- Mostly additive; no permission complexity. Good "quick win" phase after the heavy 3–5.

---

## Phase 7 — Templates — **M**

- **DB (`012`)**: `templates (id, user_id|null for built-ins, name, category, payload jsonb)`.
- Payload = serialized project + sections + tasks tree. "Save project as template"
  and "create from template". Ship a starter set of built-ins (accounting,
  editorial calendar, etc. — spec mentions 50+; we seed a useful handful).
- **Web**: template gallery + apply flow.

---

## Phase 8 — Integrations — **XL**

Strong foundation already (API keys, OpenAPI, MCP). Build outward:

- **Public REST API + docs** — already exists; harden, version, document scopes. **S**
- **MCP tools** — extend `server/src/mcp/tools.ts` with project/label/filter ops so
  agents (incl. this one) manage tasks. **M**
- **Webhooks (outbound)** — **L**: `webhooks (id, user_id, url, secret, events)`;
  emit `task.created/completed/...`; HMAC-signed. This single feature unlocks
  **Zapier / Make / n8n** without bespoke code.
- **Google Calendar (2-way sync)** — **L**: OAuth scaffold exists. Push tasks with
  dates as events; optional inbound. Token storage + sync cursor + conflict policy.
- **Slack** — **M**: incoming webhook for notifications first; slash-command /
  OAuth app to create tasks second.
- **Email-to-task** — **M**: inbound address → Inbox task (needs mail ingest).
- **Outlook / Teams / Gmail / Evernote / time-trackers** — generally reducible to
  *webhooks + OAuth + REST*; scope per-integration on demand rather than all at once.

> Recommendation: **Webhooks + public API + MCP** give ~80% of the integration
> value for ~20% of the effort. Do those before any single-vendor integration.

---

## Phase 9 — Platform & distribution — **M (feasible parts only)**

- **PWA**: installable, offline cache, service worker (also enables Web Push in
  Phase 4). **M**
- **Offline sync / real-time**: optimistic local store + sync; "real-time sync"
  across devices via WebSocket/SSE. Can be **L–XL** if done properly — scope later.
- **Responsive/mobile web**: ensure all views work on phones. **S–M**.

---

## 11. Explicitly out of scope

Not buildable inside this web codebase (platform/business, not app features):

- Native **Siri / Google Assistant / Alexa** voice apps, **Apple Watch / Wear OS** apps.
- **OS-store distribution**: Snap, AppImage, App Store, Play Store, native desktop builds.
- **Pricing tiers / billing** (Free/Pro/Business) — a product/billing concern; can be
  *simulated* with feature flags if you want the gating UX, but no payment system.
- Vendor integrations requiring paid/partner accounts are gated on you providing
  credentials (Google Cloud project, Slack app, etc.).

---

## Recommended execution order

1. **Phase 1** (foundation) — unblocks all.
2. **Phase 2** (Quick Add) — the signature UX, needs Phase 1.
3. **Phase 3** (views/filters) — makes the data usable day-to-day.
4. **Phase 6** (karma/archive) — cheap morale win, no auth refactor.
5. **Phase 4** (reminders) — needs PWA bits from Phase 9a.
6. **Phase 5** (collaboration) — heaviest refactor; do once core is stable.
7. **Phase 8** (integrations) — webhooks+API+MCP first, vendors on demand.
8. **Phase 7 / 9** — templates and platform polish, interleave opportunistically.

**Rough total:** a serious multi-month build. Each phase ships independently and
leaves the app working. Suggested first PR: **Phase 1a + 1b** (projects + priority)
as the smallest slice that visibly moves toward Todoist.
