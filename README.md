# mindlog.todo

A small, microservice-oriented **task management** service with three faces over a single
service core:

- a **REST API** (the canonical API),
- an **MCP server** (Streamable HTTP *and* stdio) so LLM agents can manage tasks,
- a **React + Vite web UI** that consumes the REST API 100% (no business logic of its own).

Tasks carry **what** (title + description), **who** (assignee), **when** (due date),
**state** (status) and **progress** (%), can be nested into **sub-tasks**, and are
**semantically searchable** via integrated **RAG** (pluggable embeddings + a generative
`ask` tool powered by Claude).

## Architecture

```
packages/core    shared service core — domain, repositories, embeddings, RAG, auth
packages/server  deployable micro-service — REST API + MCP (HTTP & stdio) + OpenAPI/Swagger
packages/web     React + Vite SPA — pure REST client
```

The REST controllers and the MCP tools both call the **same** `core` service functions, so
there is no duplicated business logic. The web UI never touches the database; it only calls
the REST API.

## Quick start (Docker)

```bash
cp .env.example .env          # defaults: local embeddings, no API keys needed
./scripts/gen-certs.sh        # local TLS cert for todo.mindlog.localhost
docker compose up --build
```

Then open **https://todo.mindlog.localhost** — a single HTTPS origin. The `web`
container is the edge: it terminates TLS, serves the SPA, and reverse-proxies the
API, MCP and docs to the `api` service.

- App / Web UI: https://todo.mindlog.localhost
- API:          https://todo.mindlog.localhost/api/v1
- API docs:     https://todo.mindlog.localhost/docs  (spec at `/openapi.json`)
- MCP:          https://todo.mindlog.localhost/mcp

Notes:
- `*.localhost` resolves to `127.0.0.1` automatically in modern browsers. For
  non-browser clients (curl, some MCP clients), add `127.0.0.1 todo.mindlog.localhost`
  to `/etc/hosts`.
- Install [mkcert](https://github.com/FiloSottile/mkcert) before running
  `gen-certs.sh` for a browser-trusted certificate; otherwise it self-signs and
  the browser shows a warning you can accept.
- Database migrations run automatically on server boot.

## Local development (without Docker)

```bash
npm install
# point DATABASE_URL at a running Postgres with the `vector` extension available
npm run migrate
npm run dev:server     # REST + MCP-HTTP on :8080
npm run dev:web        # Vite dev server on :5173 (proxies /api to :8080)
```

## Authentication

- **Manual accounts**: register with email + password (hashed with argon2).
- **Google OAuth**: optional — set `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` to enable the
  "Sign in with Google" button.
- The API uses **JWT** access tokens (short-lived) with rotating **refresh tokens**.
- Tasks are **owned per user**: each user only sees and acts on their own tasks.

## Connecting an MCP client

1. Sign in to the web UI and create an **API key** (shown once, prefix `mlt_…`).
2. Streamable HTTP transport:
   ```bash
   claude mcp add --transport http mindlog-todo https://todo.mindlog.localhost/mcp \
     --header "Authorization: Bearer mlt_…"
   ```
3. stdio transport:
   ```bash
   MINDLOG_API_KEY=mlt_… node packages/server/dist/mcp-stdio.js
   ```

Tools: `task_create`, `task_list`, `task_get`, `task_update`, `task_delete`,
`task_search` (semantic), `task_ask` (generative). All scoped to the API key's owner.

## Embeddings (RAG)

`EMBEDDING_PROVIDER` selects the provider; `EMBEDDING_DIM` must match it:

| Provider | Model                      | Dim  | Key            |
|----------|----------------------------|------|----------------|
| `local`  | Xenova/all-MiniLM-L6-v2    | 384  | none           |
| `voyage` | voyage-3                   | 1024 | `VOYAGE_API_KEY` |
| `openai` | text-embedding-3-small     | 1536 | `OPENAI_API_KEY` |

One provider per deployment; switching providers changes the vector dimension and requires
re-embedding existing tasks.

## License

[AGPL-3.0-or-later](./LICENSE). See [CONTRIBUTING](./CONTRIBUTING.md) and the
[Code of Conduct](./CODE_OF_CONDUCT.md).
