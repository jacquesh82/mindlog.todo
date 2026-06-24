# CONTEXT

**Current Task**: Todoist-parity for mindlog.todo (9-phase ROADMAP.md); autonomous,
branch `feat/todoist-parity`. Commit per feature + tests; verify UI via Docker screenshots.

**Key Decisions**:
- UI: Tailwind v4 + i18n (FR/EN) + mindlog red (#db4c3f) + Milo logo; light/dark via
  @theme token overrides. Status hybrid.
- `due_date` = scheduled; `deadline` (date-only) + `duration` separate.
- Integrations beyond API/MCP/webhooks → external plugins (later).

**Done & verified live**:
- Phases 1–3 + 6 (data model, NL Quick Add, filters + filter query language,
  karma/archive). Migrations 002–012.
- AI activity log + token usage (010). Settings (account, appearance light/dark,
  AI logs, API keys). Task editor (priority/dates/labels/project/section).
- UI polish: project view sections + list/Board(Kanban) + sort modes
  (manual/priority/date/name) + show-completed toggle; sub-tasks (nested tree,
  add-subtask, inherit parent project); label & filter & project create/edit modals
  with colour palette; project & label favourites; completed archive view;
  Search & Ask AI view.
- Bug fixes: Quick Add bilingual date parsing (keeps tags, full FR dates),
  sub-task project inheritance, settings dark-theme glitch.
- Tests: core 67 + server 56, all green. App at https://todo.mindlog.localhost:9443.

**Next Steps**:
- Phase 4: reminders (table + scheduler/poll + in-app/PWA Web Push) — STARTED then
  reverted (migration draft removed); redo cleanly. Then PWA manifest + service worker.
- Phase 5 collaboration (sharing/assign/comments — project-membership auth refactor);
  Phase 7 templates; Phase 8 webhooks + API/MCP polish; Phase 9 PWA/offline.
- Drag-and-drop between board columns; French recurrence ("tous les lundis").
