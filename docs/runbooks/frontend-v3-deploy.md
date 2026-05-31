# Frontend V3 — Redeploy Runbook

## Prerequisites

- SSH access to VPS (`187.77.206.105`)
- DNS `gda-v3-ui.csr-llc.tech` A record pointing to `187.77.206.105`
- Traefik running on `n8n_default` network with `mytlschallenge` cert resolver

## Redeploy

```bash
cd /root/gda-command-v2
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build --no-deps frontend-v3
```

## Verify

```bash
# Container running
docker ps --filter name=gda-frontend-v3

# Health check
curl -sI https://gda-v3-ui.csr-llc.tech/

# SPA fallback (should return 200 text/html)
curl -sI https://gda-v3-ui.csr-llc.tech/opportunities
```

## Rollback

```bash
# Roll back to previous image
docker compose -f docker-compose.prod.yml up -d --no-deps --no-build frontend-v3
```

## Logs

```bash
docker logs gda-frontend-v3 --tail 100 -f
```
