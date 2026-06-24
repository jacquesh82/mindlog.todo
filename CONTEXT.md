# CONTEXT

**Current Task**: Building Todoist-parity into mindlog.todo (9-phase ROADMAP.md);
autonomous mode, branch `feat/todoist-parity`. Commit per feature, tests for each.

**Key Decisions**:
- UI: Tailwind v4 + i18n (FR/EN) + mindlog red (#db4c3f); status hybrid.
- `due_date` = scheduled date; `deadline` (date-only) + `duration` separate.
- Legacy element CSS scoped under `.legacy` (login/settings) so Tailwind drives the app.
- Integrations beyond API/MCP/webhooks → external plugins (later).

**Done**:
- Phase 1 (data model): priority, projects/Inbox, sections, task↔project/section,
  labels (+assignment), deadline/duration, recurrence engine. Migrations 002–008.
- Phase 2: natural-language Quick Add (chrono EN+FR, #project/@label/p1-4/recurrence).
- Phase 3: view filters (today/overdue/noDate/label/completed) + filter query
  language `(p1|p2)&@work&7 days` with saved filters (migration 009).
- Web: Tailwind + i18n foundation, synced types/client, Todoist-look shell
  (sidebar, Today/Upcoming/Inbox/project/label/filter views, TaskRow, Quick Add).
  VERIFIED live in Docker via screenshot. App at https://todo.mindlog.localhost:9443.
- Tests: core 59 + server 51, all green. ~18 commits.

**Next Steps**:
- UI polish: project view (sections/board/calendar), label & filter creation UI,
  re-integrate semantic search + RAG "ask", task edit (priority/labels/dates), settings.
- Phase 4 reminders + PWA/Web Push; Phase 5 collaboration; Phase 6 karma/archive;
  Phase 7 templates; Phase 8 webhooks + public API/MCP polish; Phase 9 PWA/offline.
- Recurrence in French ("tous les lundis") still parses English only.
