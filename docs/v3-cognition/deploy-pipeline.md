# Deploy Pipeline — Audit & Architecture

**Issue:** F-315c
**Audited:** 2026-06-01
**Status:** Production — fires on every successful CI run against `main`

---

## 1. Trigger

| Trigger | Event | Condition |
|---------|-------|-----------|
| **Automatic** | `workflow_run` — listens for the `CI` workflow completing on `main` | Fires only when `github.event.workflow_run.conclusion == 'success'` |
| **Manual** | `workflow_dispatch` — manual "Run workflow" button in GitHub Actions | Optional `dry_run` input (git pull only, skip compose up) |

**Concurrency:** `group: deploy-prod`, `cancel-in-progress: false` — at most one deploy runs at a time; queued runs wait rather than cancel.

**Net effect:** Every push to `main` triggers CI. If all CI jobs pass, the deploy workflow fires automatically. There is no manual approval gate between CI-green and production deploy.

---

## 2. Step-by-step (what `deploy-prod.yml` does)

1. **Checkout** — `actions/checkout@v5`
2. **Resolve deploy SHA** — picks `workflow_run.head_sha` (auto) or `github.sha` (manual)
3. **Connect to Tailscale** — `tailscale/github-action@v2` with OAuth client (secrets: `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, tag: `ci`)
4. **Install SSH key** — writes `PROD_SSH_PRIVATE_KEY` to `~/.ssh/deploy_key`, scans `PROD_SSH_HOST`
5. **SCP deploy script** — copies `scripts/deploy-prod.sh` to `/tmp/deploy-prod.sh` on the VPS
6. **SSH deploy** — executes the script remotely, tees output to `/tmp/deploy-output.txt`
7. **Commit status** — writes `deploy/prod` status (success or failure + last line of output) to the commit SHA

---

## 3. What `scripts/deploy-prod.sh` does on the VPS

| Phase | Commands | Failure behavior |
|-------|----------|-----------------|
| **Git pull** | `git fetch origin && git reset --hard origin/main` | Script exits 1 (deploy fails) |
| **Dry-run exit** | If `DRY_RUN=true`, prints SHA and exits 0 | N/A |
| **Remove V2 containers** | `docker rm -f gda-backend gda-frontend` (idempotent) | Errors suppressed |
| **Resolve DATABASE_URL** | Inspects running `gda-backend-v3` env, falls back to `.env.prod` | Exits 1 if unresolvable |
| **Run V3 migrations** | Ephemeral `node:20-alpine` container on `gda-command-v2_gda` network runs `db/v3/migrate.ts` | Exits 1 if migrate fails or output doesn't match success pattern |
| **Docker build** | `docker compose -f docker-compose.prod.yml build backend-v3 frontend-v3` | Exits 1 on build failure |
| **Docker deploy** | `docker compose ... up -d --force-recreate --no-deps backend-v3 frontend-v3` | Exits 1 on failure |
| **Prune images** | `docker image prune -f` | Non-fatal |
| **Health wait (backend)** | Polls `docker inspect` health status for 60s (20 × 3s) | Exits 1 if not healthy after 60s |
| **Health wait (frontend)** | Same polling loop | Exits 1 if not healthy after 60s |
| **Verify recreation** | Confirms `State.StartedAt > deploy_start` | Exits 1 if container was not recreated |
| **Verify auth route** | `grep -r 'auth/login'` in `/app/apps/backend-v3/dist/` | Exits 1 if missing (stale image) |
| **Done** | Prints `DEPLOY_OK <sha>` | — |

---

## 4. Environment

- **Target:** Hostinger VPS at `PROD_SSH_HOST` (reachable via Tailscale)
- **Stack:** Docker Compose (`docker-compose.prod.yml`)
- **Services deployed:** `backend-v3` (port 4000), `frontend-v3` (port 80 via Traefik)
- **Services NOT redeployed:** `postgres`, `postgres-staging`, `gda-agent-v3` (left running)
- **Separately deployed:** `gda-mcp-server` (port 4100, own workflow `.github/workflows/deploy-mcp-server.yml`)
- **Reverse proxy:** Traefik (external `n8n_default` network), TLS via Let's Encrypt
- **Domains:** `gda-v3.csr-llc.tech` (backend API), `gda.csr-llc.tech` / `app.csr-llc.tech` (frontend), `gda-mcp.csr-llc.tech` (MCP server)

---

## 5. Secrets (referenced in workflow, NOT stored in this doc)

| Secret | Purpose |
|--------|---------|
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client |
| `TS_OAUTH_SECRET` | Tailscale OAuth secret |
| `PROD_SSH_PRIVATE_KEY` | SSH key for VPS |
| `PROD_SSH_HOST` | VPS hostname/IP (Tailscale) |
| `PROD_SSH_USER` | SSH user on VPS |

Production app secrets (`.env.prod` on VPS): `POSTGRES_PASSWORD`, `STAGING_POSTGRES_PASSWORD`, `JWT_SECRET`, `GDA_WEBHOOK_KEY`, API keys for Anthropic/OpenAI/SAM.gov.

---

## 6. Failure behavior (pre-F-315c)

- **On migration failure:** Script exits 1 → workflow marks commit status `failure` with last-line detail. No rollback of partial migrations.
- **On build failure:** Same — commit status failure.
- **On health check failure:** Same — but the old containers are already destroyed (`--force-recreate`). No rollback to previous image.
- **On script failure:** GitHub Actions sets commit status `failure` with error detail.
- **Alerting:** Commit status only (visible in GitHub UI). No Slack, no email, no webhook notification.
- **Rollback mechanism:** None automated. Manual intervention required: SSH to VPS, `git checkout <sha>`, rebuild.

---

## 7. CI workflow (the gate)

The `CI` workflow (`.github/workflows/ci.yml`) runs on every push to `main` and every PR. It contains 6 jobs:

| Job | What it checks |
|-----|---------------|
| `build` | `npm ci` + `npm run build` (typecheck included) |
| `test` | `npm test --workspace=packages/shared` |
| `v3-contract` | V3 backend typecheck + auth tests + contract/integration tests (pgvector DB) |
| `migration-parity-check` | Runs `db/v3/migrate.ts` dry-run + commit in CI, verifies fixture gap bounds |
| `compose-drift` | SHA256 hash of `docker-compose.prod.yml` matches `.github/expected-compose-hashes.txt` |
| `audit` | `npm audit --audit-level=high` (`continue-on-error: true` — advisory only) |

The deploy workflow's `if:` condition checks `github.event.workflow_run.conclusion == 'success'`, which requires **all non-`continue-on-error` jobs** to pass. The `audit` job has `continue-on-error: true`, so it does not block deployment.

---

## 8. Gaps identified (F-315c)

1. **No pre-deploy DB snapshot** — if migrations corrupt data, there is no rollback point.
2. **No image SHA tagging** — rollback requires a full rebuild from the previous commit.
3. **No post-deploy HTTP health checks** — only Docker health status is verified, not application-level `/healthz` endpoints.
4. **No deploy notifications** — success/failure is only visible as a GitHub commit status.
5. **No rollback automation** — if deploy fails after `--force-recreate`, the previous containers are gone.
6. **Migration dry-run not enforced as a gate** — migrations run directly in the deploy script; there is no separate CI job that dry-runs the migration against a production-schema replica.
