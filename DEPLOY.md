# Deploying mindlog.todo to str01

CI/CD via GitHub Actions: images are built and pushed to **GHCR**, then **pulled
on str01** over SSH. str01's front edge (`edge-sni`) is an **L4 SNI-passthrough**
proxy, so the web container **terminates TLS itself** on a loopback port (mirroring
the sibling `jot.mindlog.today`). Deploys run on a **version tag** (`v*`) or
**manually** from the Actions tab.

```
 git tag v1.0.0 ──► GitHub Actions
                      ├─ build api + web ─► ghcr.io/jacquesh82/mindlog.todo/{api,web}
                      └─ ssh str01 ─► docker compose -f docker-compose.prod.yml pull && up -d
                                         │
   internet ─► edge-sni :443 (ssl_preread, by SNI) ─► 127.0.0.1:9743 ─► web (TLS, LE cert)
                                                                          └─► api:8080 (same-origin /api)
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

Set `PUBLIC_URL` / `WEB_URL` to the public domain. The web container terminates
TLS itself and binds `127.0.0.1:9743` by default (`WEB_HTTPS_PORT`,
`WEB_HTTPS_BIND`); `edge-sni` routes the domain there by SNI.

### 3. TLS certificate

The web container reads `/etc/letsencrypt/live/todo.mindlog.today/` (mounted
read-only). Issue the cert once via the edge's ACME webroot (http-01):

```bash
sudo certbot certonly --webroot \
  -w /var/lib/docker/volumes/edge-certbot-webroot/_data \
  -d todo.mindlog.today --keep-until-expiring
```

certbot installs a renewal timer automatically. The cert must exist **before**
the web container starts (nginx won't boot without it).

### 4. Add the SNI route to the edge

`edge-sni` (nginx `stream` + `ssl_preread`) demuxes `:443` by hostname to each
app's loopback TLS port. Add `todo.mindlog.today` to its map
(`/srv/jot-src/deploy/str01/edge/nginx.conf`):

```nginx
map $ssl_preread_server_name $backend {
    jot.mindlog.today          jot_backend;
    todo.mindlog.today         todo_backend;   # <-- add
    ...
}
upstream todo_backend { server 127.0.0.1:9743; }   # <-- add
```

> Edit the file **in place** (don't `sed -i`/rename — that swaps the inode and
> the bind-mounted container keeps serving the old config). Validate in a
> throwaway container, then reload — or recreate `edge-sni` to re-attach the
> mount (brief blip for all tenants):
>
> ```bash
> docker run --rm -v /srv/jot-src/deploy/str01/edge/nginx.conf:/etc/nginx/nginx.conf:ro \
>   nginx:1.27-alpine nginx -t      # validate, no impact
> docker restart edge-sni           # re-attach mount + load route
> ```

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
