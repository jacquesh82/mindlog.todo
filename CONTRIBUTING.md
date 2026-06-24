# Contributing to mindlog.todo

Thanks for your interest in contributing! This project is licensed under
**AGPL-3.0-or-later**; by submitting a contribution you agree to license it under the same
terms.

## Getting started

```bash
npm install
cp .env.example .env
docker compose up db          # or point DATABASE_URL at your own Postgres + pgvector
npm run migrate
npm run dev:server
npm run dev:web
```

## Ground rules

- **One service core.** Business logic lives in `packages/core`. REST controllers and MCP
  tools are thin adapters — do not duplicate logic in them. The web UI must only call the
  REST API.
- **Validation = documentation.** Request/response shapes are defined once as zod schemas in
  `core` and reused to generate the OpenAPI spec. Add/extend schemas rather than hand-writing
  docs.
- **Type-check and build before opening a PR:**
  ```bash
  npm run typecheck
  npm run build
  npm test
  ```
- Keep commits focused and write clear messages. Reference issues where relevant.

## Reporting bugs / requesting features

Open an issue with steps to reproduce (for bugs) or a concrete use case (for features).

## Security

Please do not file public issues for security vulnerabilities. Email the maintainer at
jacques@hullu.fr instead.
