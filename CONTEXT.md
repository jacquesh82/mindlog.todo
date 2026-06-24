# CONTEXT

**Current Task**: Todoist-parity for mindlog.todo (9-phase ROADMAP.md); autonomous,
branch `feat/todoist-parity`. Commit per feature + tests; verify UI via Docker screenshots.

**Key Decisions**:
- UI: Tailwind v4 + i18n (FR/EN) + mindlog red (#db4c3f); status hybrid.
- Legacy element CSS scoped under `.legacy` (login only) so Tailwind drives the app.
- `due_date` = scheduled; `deadline` (date-only) + `duration` separate.
- Integrations beyond API/MCP/webhooks → external plugins (later).

**Done & verified live**:
- Phase 1 data model (priority, projects/Inbox, sections, labels, deadline/duration,
  recurrence) — migrations 002–008.
- Phase 2 NL Quick Add (chrono EN+FR). Phase 3 view filters + filter query language
  + saved filters (009). Phase 6 completed_at + Karma + archive (011).
- AI activity log + token usage (010); Settings page (Tailwind, fixes theme);
  task editor modal; Search & Ask AI view; Karma sidebar badge.
- Tests: core 65 + server 55, all green. App at https://todo.mindlog.localhost:9443.

**Next Steps (remaining plan)**:
- UI polish: project view sections/board/calendar, label & filter & section creation
  UI, completed-archive view, project context-menu (rename/color/favorite/delete).
- Phase 4 reminders + PWA/Web Push; Phase 5 collaboration (sharing/assign/comments,
  needs project-membership auth refactor); Phase 7 templates; Phase 8 webhooks +
  public API/MCP polish; Phase 9 PWA/offline/real-time.
- French recurrence ("tous les lundis") still parses English only.
