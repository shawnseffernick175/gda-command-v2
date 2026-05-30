# V3 Rollback Runbook

**Target: rollback < 5 minutes from decision.**

## When to Rollback

- Sustained 5xx error rate from V3 backend (>5% of requests for >2 minutes)
- Multiple R2 violations (503 ANALYSIS_TIMEOUT) with no recovery
- Data integrity issues detected by Sentinel in soak_metrics
- User-reported critical workflow failures confirmed by QA

## Steps

### 1. Set API version to V2

In the deployment environment (Hostinger VPS or CI/CD pipeline), set:

```bash
VITE_API_ACTIVE=v2
```

This is the only change required. No code modification.

### 2. Redeploy frontend container

```bash
# SSH into the VPS
ssh root@<VPS_IP>

# Rebuild the frontend with V2 flag
cd /opt/gda-command
export VITE_API_ACTIVE=v2
docker compose build frontend
docker compose up -d frontend
```

Or if using CI/CD:

```bash
# Trigger a redeploy with the env var override
# The CI pipeline reads VITE_API_ACTIVE from deploy env
git tag -a v3-rollback-$(date +%Y%m%d-%H%M) -m "Rollback to V2"
git push origin --tags
```

### 3. Verify health endpoint returns V2 marker

```bash
curl -s https://gda.csr-llc.tech/api/health | jq '.data.version // .version'
```

Expected: the V2 backend responds (no `meta.source: "v3"` envelope).

If using the API directly:

```bash
curl -s https://gda.csr-llc.tech/api/health
```

The response shape will be the V2 format (flat JSON, no `success`/`meta` envelope).

### 4. Page on-call

Notify Shawn (or the designated on-call) that rollback was executed:

- **What**: Frontend rolled back from V3 to V2
- **When**: Timestamp of the rollback
- **Why**: Brief description of the trigger (error rate, R2 violation, etc.)
- **Evidence**: Link to soak_metrics or Sentinel dashboard showing the issue

## Post-Rollback Checklist

- [ ] Confirm all frontend pages load without errors
- [ ] Confirm opportunity detail page triggers V2 analysis flow
- [ ] Confirm no V3-specific API paths are being called (check browser Network tab)
- [ ] Document the failure in `docs/stabilization/` with root cause
- [ ] Create a fix PR before re-attempting cutover

## Re-Cutover (after fix)

```bash
VITE_API_ACTIVE=v3
# Redeploy frontend
docker compose build frontend
docker compose up -d frontend
```

Verify with:

```bash
curl -s https://gda.csr-llc.tech/api/health | jq '.meta.source'
# Expected: "v3"
```

## Architecture Notes

The frontend reads `VITE_API_ACTIVE` at **build time** (Vite inlines env vars). A rollback
requires a frontend rebuild, but the backend stays up on both V2 and V3 throughout. The V2
backend is never shut down during the 30-day soak.

| Env Var | Default | Purpose |
|---|---|---|
| `VITE_API_ACTIVE` | `v3` | Which backend the frontend targets |
| `VITE_API_BASE_V2` | `/api` | V2 API base path |
| `VITE_API_BASE_V3` | `/api` | V3 API base path |
