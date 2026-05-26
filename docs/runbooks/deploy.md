# Auto-Deploy Runbook — GDA Command v2

## How It Works

```
PR merged to main
        │
        ▼
  CI workflow runs
  (Build, Test, Migrations, Audit)
        │
        ▼  (all green)
  Deploy workflow triggers
  (workflow_run event)
        │
        ▼
  GitHub runner joins Tailscale
        │
        ▼
  SSH to VPS (100.x.x.x)
        │
        ▼
  scripts/deploy-prod.sh
  ├─ git fetch + reset --hard origin/main
  ├─ Record previous image tag
  ├─ docker compose up -d --build backend
  ├─ Wait for container healthy (60s)
  └─ Health check: GET /api/sentinel/current (90s)
        │
        ▼
  Post commit status (success/failure)
```

## Triggering a Deploy

### Automatic (default)
Every push to `main` that passes CI automatically deploys. No manual action needed.

### Manual via workflow_dispatch
1. Go to **Actions** → **Deploy to Prod** → **Run workflow**
2. Select branch: `main`
3. Optionally check **dry_run** (git pull only, no compose up)
4. Click **Run workflow**

Direct link: `https://github.com/shawnseffernick175/gda-command-v2/actions/workflows/deploy-prod.yml`

## Manual Rollback

If a deploy fails and needs immediate rollback:

```bash
ssh root@100.100.80.78
cd /root/gda-command-v2

# Option 1: Rollback to previous image
PREV=$(cat /tmp/prev_image.txt)
docker tag "$PREV" gda-command-v2-backend:latest
docker compose -f docker-compose.prod.yml up -d backend

# Option 2: Rollback to specific commit
git fetch origin
git reset --hard <commit-sha>
docker compose -f docker-compose.prod.yml up -d --build backend
```

Verify health after rollback:
```bash
docker exec gda-backend wget -qO- http://localhost:3001/api/sentinel/current | python3 -m json.tool
```

## Required GitHub Secrets

| Secret | Description | How to obtain |
|--------|-------------|---------------|
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID | [Tailscale Admin Console → Settings → OAuth clients](https://login.tailscale.com/admin/settings/oauth) → New client → scope `devices`, tag `tag:ci` |
| `TS_OAUTH_SECRET` | Tailscale OAuth client secret | Generated alongside `TS_OAUTH_CLIENT_ID` above |
| `PROD_SSH_PRIVATE_KEY` | SSH private key for VPS access | `ssh-keygen -t ed25519 -f deploy_key -N ""` → add `deploy_key.pub` to VPS `~/.ssh/authorized_keys` → paste `deploy_key` contents as secret |
| `PROD_SSH_HOST` | VPS Tailscale IP | `100.100.80.78` (Tailscale address of `gda-vps-prod`) |
| `PROD_SSH_USER` | SSH username | `root` |

### Tailscale OAuth Setup

1. Go to [Tailscale Admin Console → Settings → OAuth clients](https://login.tailscale.com/admin/settings/oauth)
2. Create new OAuth client:
   - Description: `GDA GitHub Actions deploy`
   - Scopes: `devices` (write)
3. Create an ACL tag `tag:ci` in [Access Controls](https://login.tailscale.com/admin/acls):
   ```json
   "tagOwners": {
     "tag:ci": ["autogroup:admin"]
   }
   ```
4. Ensure ACL allows `tag:ci` to reach `gda-vps-prod` on port 22:
   ```json
   {
     "action": "accept",
     "src": ["tag:ci"],
     "dst": ["gda-vps-prod:22"]
   }
   ```
5. Add `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET` to GitHub repo secrets

## Production Gotchas

- **Compose service name** is `backend` — the `container_name` is `gda-backend`
  ```bash
  # Correct:
  docker compose -f docker-compose.prod.yml up -d --build backend
  # Wrong:
  docker compose -f docker-compose.prod.yml up -d --build gda-backend
  ```
- **Container is Alpine Linux** — `curl` is NOT available. Use `wget` instead:
  ```bash
  docker exec gda-backend wget -qO- http://localhost:3001/api/sentinel/current
  ```
- **Backend port inside container** is **3001** (set by `PORT` env var in docker-compose.prod.yml)
- **Health check endpoint** is `GET /api/sentinel/current` (public, no auth required)
- **Deploy script** does `git reset --hard origin/main` — any uncommitted local changes on the VPS will be lost
- **Previous image** is saved to `/tmp/prev_image.txt` for manual rollback
- **No auto-rollback** in v1 — on failure, the workflow logs the previous image and exits non-zero

## Scope

This workflow deploys **backend only**. Frontend and n8n containers are not touched.

Future PRs:
- F-041g: Auto-rollback on health check failure
- F-041h: Slack/Discord deploy notifications
