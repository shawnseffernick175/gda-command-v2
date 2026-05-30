# Deploy Runbook — backend-v3

## Prerequisites

- DNS A record for `gda-v3.csr-llc.tech` pointing at the VPS IPv4 (same IP as `gda.csr-llc.tech`).
  - Cloudflare → `csr-llc.tech` zone → Add record:
    - Type: `A`
    - Name: `gda-v3`
    - Content: VPS IPv4 (run `dig +short gda.csr-llc.tech` to look it up)
    - Proxy status: **DNS only** (grey cloud) — Traefik handles TLS
    - TTL: Auto
- `.env` on the VPS must contain `STAGING_POSTGRES_PASSWORD` and `JWT_SECRET`.

## Steps

1. **Merge the PR** that adds `apps/backend-v3/Dockerfile`, the `backend-v3` service in `docker-compose.prod.yml`, and this runbook.

2. **Add the DNS A record** in Cloudflare (see Prerequisites above).

3. **SSH to the VPS:**
   ```bash
   ssh user@<vps-ip>
   ```

4. **Pull latest code:**
   ```bash
   cd /opt/gda-command-v2 && git pull origin main
   ```

5. **Build the backend-v3 image:**
   ```bash
   docker compose -f docker-compose.prod.yml build backend-v3
   ```

6. **Start the service:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d backend-v3
   ```

7. **Wait ~30 seconds**, then run the evidence gate checks below.

## Evidence Gate (8 items)

Run each command from the VPS and verify the expected output:

```bash
# 1. Container running and healthy
docker ps --filter name=gda-backend-v3 --format '{{.Names}} {{.Status}}'
# Expected: gda-backend-v3 Up (healthy)

# 2. DATABASE_URL points at postgres-staging
docker inspect gda-backend-v3 --format '{{.Config.Image}} {{.Config.Env}}'
# Expected: DATABASE_URL pointing at postgres-staging

# 3. /v3/health returns 200 with status:ok and version (gitSha)
curl -fsS https://gda-v3.csr-llc.tech/v3/health
# Expected: HTTP 200, body includes "status":"ok" and a version/gitSha

# 4. /v3/ready returns 200
curl -fsS https://gda-v3.csr-llc.tech/v3/ready
# Expected: HTTP 200

# 5. /v3/metrics returns Prometheus exposition
curl -fsS https://gda-v3.csr-llc.tech/v3/metrics | head -20
# Expected: Prometheus text exposition format

# 6. TLS certificate is valid
curl -fsSI https://gda-v3.csr-llc.tech/v3/health | grep -i 'strict-transport-security\|content-type'
# Expected: No curl TLS error, HSTS or valid cert headers

# 7. Soak metrics are being written (after 5 min uptime)
docker exec gda-postgres-staging psql -U gda_staging -d gda_staging -c "SELECT count(*) FROM soak_metrics;"
# Expected: count > 0

# 8. Logs show successful startup, no FATAL errors
docker logs gda-backend-v3 --tail 50
# Expected: "Server listening" log line, no FATAL / unhandled error stack traces
```

## Rollback

```bash
docker compose -f docker-compose.prod.yml stop backend-v3
docker compose -f docker-compose.prod.yml rm -f backend-v3
```

## Notes

- backend-v3 listens on port 4000 internally; Traefik terminates TLS on `gda-v3.csr-llc.tech`.
- Connects to `postgres-staging` (the migrated DB with 15,742 opps from F-212), NOT `postgres` (V2).
- The `traefik` network is the external `n8n_default` network, same as other services.
