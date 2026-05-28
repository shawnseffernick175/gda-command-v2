# VPS Access Patterns

## Connection

| Item | Value |
|------|-------|
| VPS | srv1397562 |
| Tailscale IP | `100.100.80.78` |
| SSH | `ssh root@100.100.80.78` |
| Backend container | `gda-backend` |
| DB container | `gda-postgres` |
| n8n container | `n8n-envision-n8n-1` |

Port 3001 is **not** exposed on the host. Use the container IP directly:

```bash
docker inspect gda-backend --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
# Typically 172.22.0.3
```

## Common docker exec patterns

```bash
# Shell into backend
docker exec -it gda-backend sh

# Check env var (show first 8 chars only — never print full secrets)
docker exec gda-backend printenv OPENAI_API_KEY | head -c 8

# Tail backend logs
docker logs -f --tail 100 gda-backend

# Filter for ingestion logs
docker logs gda-backend 2>&1 | grep -E 'ingest_|embed_'

# Run a one-off query
docker exec gda-postgres psql -U gda_runtime -d gda -c "SELECT count(*) FROM knowledge_documents"
```

## Env file locations

| Service | Env file path |
|---------|---------------|
| gda-backend | `/root/gda-command-v2/.env` |
| n8n | `/root/n8n-envision/.env` |
| gda-postgres | Inline in compose or `/root/gda-command-v2/.env` |

> **WARNING:** Never print, log, or commit env file contents. Only reference the file path.

## Restarting services

```bash
# Restart backend only (preserves n8n and postgres)
cd /root/gda-command-v2
docker compose up -d --build backend

# Full restart (all services)
docker compose up -d --build
```

## Git operations on VPS

The VPS runs from `main` via auto-deploy (GitHub Actions workflow `deploy.yml`).
Do not manually `git pull` on VPS unless debugging a deploy failure.

```bash
# Check current deployed commit
docker exec gda-backend printenv DEPLOY_COMMIT_SHA
```
