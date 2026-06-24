# CONTEXT

**Current Task**: Todoist-parity for mindlog.todo (9-phase ROADMAP.md); autonomous,
branch `feat/todoist-parity`. Commit per feature + tests; verify UI via Docker screenshots.

**Key Decisions**:
- UI: Tailwind v4 + i18n (FR/EN) + mindlog red (#db4c3f) + Milo logo; light/dark via
  @theme token overrides.
- Quick Add syntax = Todoist: `#` = project, `@` = label (both auto-create if missing).
- `due_date` = scheduled; `deadline` (date-only) + `duration` separate.
- Integrations beyond API/MCP/webhooks → external plugins (later).

**OPERATIONAL NOTE**: after any change under `packages/core`, rebuild BOTH containers
(`docker compose up -d --build api web`) — rebuilding only `web` leaves the API on
stale core (this caused #project/attachments to silently not work until api rebuild).

**Done & verified live** (migrations 002–013):
- Phases 1–3 + 6 (data model, NL Quick Add, filters + query language, karma/archive).
- AI logs + token usage; settings (account/appearance light-dark/AI/keys); task editor.
- Project views: list / board (Kanban, seeds default sections) / calendar.
- Sub-tasks (nested tree, inherit parent project), sort modes, show-completed toggle,
  completed archive, project+label favourites, label/filter/project modals, separated
  Filters/Labels sections (My Projects below Labels).
- Quick Add: #/@ autocomplete, #project & @label auto-create, bilingual date parsing.
- Attachments that feed the RAG (text folded into task embedding). Search & Ask AI view.
- SVG illustrations (empty states + login Milo). Dark-mode select contrast fixed.
- Tests: core 67 + server 58, all green. App at https://todo.mindlog.localhost:9443.

**Next Steps**:
- Phase 4 reminders + PWA/Web Push (not started); Phase 5 collaboration; Phase 7
  templates; Phase 8 webhooks + API/MCP polish; Phase 9 PWA/offline.
- Drag-and-drop between board columns; French recurrence ("tous les lundis").
