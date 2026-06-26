# Deploying mindlog.todo to str01

CI/CD via GitHub Actions: images are built and pushed to **GHCR**, then **pulled
on str01** over SSH. The app is served under the **`/app` sub-path** of
`https://todo.mindlog.today`; the root is the marketing site (`mindlog.todo.web`),
which terminates TLS and proxies `/app` to this app's web container over plain
HTTP. The CI bakes the `/app` base into the SPA (`VITE_BASE=/app/`,
`VITE_API_URL=/app`). Deploys run on a **version tag** (`v*`) or **manually**.

```
 git tag v1.0.0 ──► GitHub Actions
                      ├─ build api + web ─► ghcr.io/jacquesh82/mindlog.todo/{api,web}
                      └─ ssh str01 ─► docker compose -f docker-compose.prod.yml pull && up -d

 internet ─► edge-sni :443 (SNI) ─► 127.0.0.1:9743 ─► mindlog.todo.web (TLS, LE cert)
                                                        ├─ /        → Astro marketing site
                                                        └─ /app/    → 127.0.0.1:8080 ─► web (HTTP)
                                                                                         └─► api:8080
```

## One-time setup

### 1. GitHub repository secrets

`Settings → Secrets and variables → Actions → New repository secret`:

| Secret | Required | Description |
|--------|----------|-------------|
| `STR01_HOST` | ✅ | str01 hostname or IP (e.g. `str01.example.com`) |
| `STR01_USER` | ✅ | SSH user with Docker access (in the `docker` group) |
| `STR01_SSH_KEY` | ✅ | **Private** SSH key (PEM) whose public half is in that user's `~/.ssh/authorized_keys` |
| `STR01_SSH_PORT` | optional | SSH port (defaults to `22`) |
| `STR01_PATH` | optional | Deploy dir on str01 (defaults to `mindlog.todo` in the user's home) |

> The registry login on the server uses the workflow's own `GITHUB_TOKEN`
> (packages: read) — no extra PAT needed.

Generate a deploy key pair locally:

```bash
ssh-keygen -t ed25519 -C "github-deploy-str01" -f str01_deploy -N ""
# str01_deploy.pub  -> append to str01:~/.ssh/authorized_keys
# str01_deploy      -> paste into the STR01_SSH_KEY secret
```

### 2. Prepare str01

```bash
# On str01, as STR01_USER:
mkdir -p ~/mindlog.todo && cd ~/mindlog.todo   # must match STR01_PATH
# Create the production env file (NOT committed, lives only here):
curl -fsSL https://raw.githubusercontent.com/jacquesh82/mindlog.todo/main/.env.prod.example -o .env
$EDITOR .env   # set JWT_SECRET, POSTGRES_PASSWORD, PUBLIC_URL/WEB_URL, etc.
```

Generate the required secrets:

```bash
openssl rand -hex 32   # -> JWT_SECRET
openssl rand -hex 24   # -> POSTGRES_PASSWORD
```

Set `PUBLIC_URL` / `WEB_URL` to `https://todo.mindlog.today/app` (the sub-path).
The web container serves plain HTTP and binds `127.0.0.1:8080` by default
(`WEB_HTTP_PORT`, `WEB_HTTP_BIND`).

### 3. TLS, edge, and the `/app` front

TLS termination, the Let's Encrypt cert, the `edge-sni` SNI route for
`todo.mindlog.today`, and the path split (`/` → marketing site, `/app/` → this
app) are all owned by the **`mindlog.todo.web`** deployment (the Astro front that
proxies `/app` here). See that repo's `DEPLOY.md`. This app only needs to be
reachable on `127.0.0.1:8080` for the front to proxy to.

## Deploying

- **Tag a release:**
  ```bash
  git tag v1.0.0 && git push origin v1.0.0
  ```
- **Or manually:** Actions tab → *Deploy to str01* → *Run workflow*.

The workflow builds both images, ships `docker-compose.prod.yml` +
`nginx.prod.conf` to str01, logs in to GHCR, pulls the new images, and rolls the
stack with `docker compose up -d`. Database migrations run automatically on API
start-up.

## Operating

```bash
cd ~/mindlog.todo
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
# Backup the database:
docker compose -f docker-compose.prod.yml exec db pg_dump -U mindlog mindlog > backup.sql
```

## Rollback

Images are tagged with the git tag/short SHA as well as `latest`. To pin a known
good build:

```bash
cd ~/mindlog.todo
IMAGE_TAG=v0.9.0 docker compose -f docker-compose.prod.yml up -d
```
