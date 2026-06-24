# CONTEXT

**Current Task**: Building Todoist-parity into mindlog.todo (9-phase ROADMAP.md);
working on branch `feat/todoist-parity`.

**Key Decisions**:
- UI: Tailwind + i18n (FR/EN) + mindlog red (~#db4c3f); status hybrid (completed_at
  is truth, rich statuses kept, board by section or status).
- Each feature: own migration + unit/integration tests + a documented commit.
- Integrations beyond API/MCP/webhooks become external plugins (later).

**Done (Phase 1 spine)**: vitest in core; P1–P4 priority; projects + auto Inbox;
sections; tasks linked to project/section (migrations 002–005). core 10 + server 34 tests green.

**Next Steps**:
- Labels (1c), rich dates start/deadline/duration (1d), recurrence (1e).
- Then the big web rebuild: Tailwind + i18n + Todoist-like views (Today/Upcoming/Board/Calendar).
