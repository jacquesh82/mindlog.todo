# CONTEXT

**Current Task**: Building Todoist-parity into mindlog.todo (9-phase ROADMAP.md);
autonomous mode, on branch `feat/todoist-parity`. Commit per feature, tests for each.

**Key Decisions**:
- UI: Tailwind + i18n (FR/EN) + mindlog red (~#db4c3f); status hybrid (completed_at
  is truth, rich statuses kept, board by section or status).
- `due_date` = scheduled date; `deadline` (date-only) + `duration` are separate.
- Integrations beyond API/MCP/webhooks become external plugins (later).

**Done — Phase 1 COMPLETE (data model)**: vitest in core; P1–P4 priority; projects +
auto Inbox; sections; tasks↔project/section; labels (CRUD + assignment); deadline +
duration; recurrence engine (NL parse + next-occurrence, reschedule-on-complete).
Migrations 002–008. Tests: core 43 + server 42, all green.

**Next Steps**:
- Phase 2: natural-language Quick Add (chrono-node) + Inbox capture.
- Phase 3: views (Today/Upcoming/Board/Calendar) + custom filter query language.
- THE BIG UI REBUILD: Tailwind + i18n + Todoist look (sidebar, lists). Web `types.ts`
  still needs syncing with the new core Task fields (project/section/labels/dates/recurrence).
