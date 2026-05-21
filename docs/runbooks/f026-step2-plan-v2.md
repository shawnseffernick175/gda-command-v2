# F-026 Step 2 — Network Bridge Plan (v2)

**Author:** Devin  
**Date:** 2026-05-21  
**Status:** APPROVED — execute at 15:00 UTC 2026-05-22 after Tier 0 closes.

---

## Objective

Enable n8n to reach `gda-postgres` over Docker networking so that
workflow Postgres nodes can be repointed from `n8n-envision-postgres-1`
to `gda-postgres` in Step 4.

---

## Invariant (WRITTEN RULE)

**n8n's existing "Postgres account" credential (ID=yK1VVsSN3tn0baVm) pointing
to `n8n-envision-postgres-1` is NOT modified in Step 2.** This credential
connects n8n to its own internal database (`n8n` DB on `n8n-envision-postgres-1`).
Step 2 is purely additive — it creates a new network route to `gda-postgres`.
The existing n8n→n8n-postgres path is untouched. Do not "clean up" or modify
this credential during Step 2.

Similarly, the "GDA Postgres" credential (ID=HwronxMmGY5XDGEt) — currently
misconfigured to point at `n8n-envision-postgres-1` — is NOT modified in
Step 2. That repoint happens in Step 4 after schema migration.

---

## Current Network Topology

```
┌─────────────────────────────────┐
│  n8n_default (172.18.0.0/16)    │  ← External network, Traefik lives here
│  - n8n-traefik-1     172.18.0.2 │
│  - gda-frontend      (also on gda-command-v2_gda)
│  - n8n-envision-n8n-1 (also on envision-internal)
│  - n8n-envision-mcp-1 (also on envision-internal)
│  - root-mcp-1                   │
└─────────────────────────────────┘

┌──────────────────────────────────────────┐
│  n8n-envision_envision-internal          │
│  (172.20.0.0/16)                         │
│  - n8n-envision-postgres-1  172.20.0.4   │  ← n8n's own DB (UNTOUCHED)
│  - n8n-envision-n8n-1       172.20.0.3   │
│  - n8n-envision-redis-1     172.20.0.2   │
│  - n8n-envision-mcp-1                    │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│  gda-command-v2_gda (172.22.0.0/16)      │
│  - gda-postgres   172.22.0.2             │  ← Target: n8n needs to reach this
│  - gda-backend    172.22.0.3             │
│  - gda-frontend   (also on n8n_default)  │
└──────────────────────────────────────────┘
```

**Problem:** n8n is on `envision-internal` + `n8n_default`. gda-postgres
is on `gda-command-v2_gda` only. No shared network → n8n cannot resolve
or reach `gda-postgres`.

---

## Proposed Change

**Add `gda-postgres` to the existing `n8n_default` network.**

### Why `n8n_default` and not a new network

- `n8n_default` already exists as an external network.
- n8n is already on `n8n_default`.
- gda-frontend already uses `n8n_default` for Traefik routing.
- Creating a new external network would require changes to both compose
  files and a restart of n8n — more blast radius.
- `n8n_default` is the established "shared" network on this host.

### What changes

**`docker-compose.prod.yml`** (the active compose file at `/root/gda-command-v2/`):
Add `gda-postgres` to the `traefik` network (aliased to `n8n_default`).

```yaml
postgres:
  # ... existing config ...
  networks:
    - gda
    - traefik    # ← ADD THIS LINE
```

This is a 1-line addition. `gda-postgres` keeps its existing `gda`
network for backend communication. It gains `n8n_default` for n8n
reachability.

**No changes to n8n's compose file** for this step.

### Apply with

```bash
cd /root/gda-command-v2
docker compose -f docker-compose.prod.yml up -d postgres
```

This recreates only the postgres container with the new network
attachment. Data volume (`pgdata`) persists — no data loss.

### Container join order

1. `gda-postgres` gets recreated with additional network (~5-10s restart).
2. `gda-backend` auto-reconnects via health check (depends_on postgres healthy).
3. No other containers are affected.

---

## Pre-State Snapshot (captured before execution)

Will capture and save the following before any change:

```bash
# 1. Running containers
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 2. Networks
docker network ls

# 3. n8n_default membership (the network being modified)
docker network inspect n8n_default

# 4. gda-postgres current networks
docker inspect gda-postgres --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'

# 5. docker-compose.prod.yml git state
cd /root/gda-command-v2 && git log -1 --oneline docker-compose.prod.yml
```

All output saved to `/root/f026-step2-pre-state.txt` on the VPS before
execution begins. Rollback verified against this snapshot.

---

## Verification (3-layer)

### Layer 1: Network-level (raw TCP)

```bash
docker exec n8n-envision-n8n-1 \
  sh -c "apt-get update -qq && apt-get install -y -qq postgresql-client && \
  PGPASSWORD=<gda_app_password> psql -h gda-postgres -U gda_app -d gda_command \
  -c 'SELECT current_database(), current_user, version();'"
```

**Success:** Returns `gda_command | gda_app | PostgreSQL 16.x`

### Layer 2: n8n application-level (credential + workflow)

1. Create a temporary n8n credential **"gda-postgres-test"** (type: Postgres):
   - Host: `gda-postgres`
   - Port: `5432`
   - Database: `gda_command`
   - User: `gda_app`
   - Password: (gda_app password)
   - SSL: off (internal Docker network)

2. Create a throwaway test workflow **"GDA.test.postgres-bridge-verify"**:
   - Manual trigger → single Postgres node using "gda-postgres-test" credential
   - Query: `SELECT current_database() AS db, current_user AS role, count(*) AS table_count FROM pg_tables WHERE schemaname = 'public';`
   - Expected result: `db=gda_command, role=gda_app, table_count=86+`

3. Execute manually. Confirm green execution.

4. **Delete** the test workflow AND the "gda-postgres-test" credential.
   These are throwaway — Step 4 will create the real credential later.

**Success:** n8n workflow executes green, returns correct database/role/count.

### Layer 3: Existing services unaffected

**3a. Backend health:**

```bash
curl -s https://gda.csr-llc.tech/api/health
```

**Success:** Returns `200 ok`.

**3b. n8n health:**

```bash
curl -s https://n8n.csr-llc.tech/healthz
```

**Success:** Returns healthy status.

**3c. Named canary workflow: `GDA.cron.system-watchdog`**

This workflow runs every 10 minutes and uses the "GDA Postgres" credential
(ID=HwronxMmGY5XDGEt), which currently points to `n8n-envision-postgres-1`.
It is the concrete proof that the additive network change did not perturb
the existing n8n→n8n-postgres data path.

After the network change, wait for the next scheduled execution of
`GDA.cron.system-watchdog` (within ≤10 minutes). Confirm it executes
green in the n8n execution log.

**Success:** `GDA.cron.system-watchdog` next scheduled execution completes
with status "success" in the n8n execution history.

---

## Traefik Impact Assessment

**Risk: None.**

Traefik uses `--providers.docker.exposedbydefault=false`. Only containers
with `traefik.enable=true` labels are registered as backends.

`gda-postgres` has **no Traefik labels**. Adding it to `n8n_default`
does not create any Traefik routes.

**Current Traefik routing (unchanged by this plan):**

| Router | Host | Backend |
|---|---|---|
| `gda-app` | `gda.csr-llc.tech`, `app.csr-llc.tech` | `gda-frontend:80` |
| `n8n` | `n8n.csr-llc.tech` | `n8n:5678` |
| `mcp` | `mcp.csr-llc.tech` | `n8n-envision-mcp-1:3002` |
| `mcp2` | `mcp.csr-llc.tech` | `root-mcp-1:3010` |

**Orphan conflict (resolved):** The removed `gda-v2-frontend` had a
conflicting router for `gda.csr-llc.tech`. Gone since Tier 0 cleanup.

**mcp/mcp2 conflict:** Tracked separately as F-024c (#267). Not in scope.

---

## Rollback Plan

### Immediate rollback (< 1 minute, no restart)

```bash
docker network disconnect n8n_default gda-postgres
```

Removes `gda-postgres` from `n8n_default` without restarting. All
existing connections on the `gda` network remain intact. Backend
unaffected.

### Full rollback (revert compose change)

```bash
cd /root/gda-command-v2
# Remove the `- traefik` line from postgres networks
docker compose -f docker-compose.prod.yml up -d postgres
```

### What could go wrong

1. **Brief backend DB disconnection (~5-10s)** during `up -d postgres`.
   Backend health check auto-reconnects. Mitigated by scheduling in
   low-traffic window.

2. **DNS collision:** n8n's compose uses service name `postgres` but
   container name `n8n-envision-postgres-1`. Docker DNS on shared
   networks resolves by container name. `gda-postgres` and
   `n8n-envision-postgres-1` are distinct — no collision.

### Rollback verification

Compare post-rollback state against pre-state snapshot saved in
`/root/f026-step2-pre-state.txt`. Specifically:
- `docker network inspect n8n_default` should NOT contain `gda-postgres`
- `docker inspect gda-postgres` should show only `gda-command-v2_gda`
- Backend health returns 200

---

## What This Step Does NOT Do

- Does **NOT** modify n8n's "Postgres account" credential (n8n→n8n-postgres path untouched)
- Does **NOT** modify the "GDA Postgres" credential (that's Step 4)
- Does **NOT** migrate any data (Step 3)
- Does **NOT** change n8n's compose file
- Does **NOT** change any workflow JSON
- Does **NOT** expose `gda-postgres` port to the host (stays internal only)

---

## Execution Window

**Proposed: 2026-05-22 at 15:00 UTC (11:00 AM ET)**

Rationale:
- After intel-feed 08:00 UTC capture (Tier 0 closure)
- Between the morning cron wave (02:00-13:00 UTC) and evening crons
- Only recurring jobs at this hour: every-5/10/15/30-minute monitors
  (system-watchdog, change-detector, auto-index-docs, data-sync,
  auto-opp-analysis, stage-auto-promote) — these hit n8n-envision-postgres-1,
  not gda-postgres, so they're unaffected by the restart
- gda-backend is the only service that loses DB for ~5-10s
- No scheduled cron jobs write to gda-postgres at 15:00 UTC

---

## Execution Sequence

| Step | Action | Gate |
|---|---|---|
| T-0 | This plan committed to repo and merged | Plan-of-record in git |
| T-1 | Capture pre-state snapshot | Saved to `/root/f026-step2-pre-state.txt` |
| T-2 | Edit `docker-compose.prod.yml`, run `docker compose up -d postgres` | Container recreated |
| T-3 | Layer 1: raw psql from n8n container to gda-postgres | Returns `gda_command \| gda_app` |
| T-4 | Layer 2: create temp credential + test workflow, execute, confirm green, delete both | Workflow green |
| T-5 | Layer 3a: backend health check | 200 ok |
| T-6 | Layer 3b: n8n health check | Healthy |
| T-7 | Layer 3c: wait for `GDA.cron.system-watchdog` next execution (≤10 min) | Green in execution history |
| T-8 | Capture post-state snapshot | Saved alongside pre-state |
| T-9 | Commit execution record to `docs/runbooks/f026-step2-execution-2026-05-22.md` | Audit trail in git |

If ANY verification step fails → immediate rollback:
`docker network disconnect n8n_default gda-postgres`, verify rollback
against pre-state snapshot, STOP. No fix-forward without architect re-review.

---

## Execution Checklist

- [x] Shawn approves plan v2 + execution window
- [ ] Plan committed to repo (this file)
- [ ] Capture pre-state snapshot to `/root/f026-step2-pre-state.txt`
- [ ] Edit `docker-compose.prod.yml`: add `- traefik` to postgres networks
- [ ] `docker compose -f docker-compose.prod.yml up -d postgres`
- [ ] Verify `gda-postgres` on both networks: `docker inspect gda-postgres`
- [ ] Layer 1: raw psql from n8n container to gda-postgres
- [ ] Layer 2: create temp credential + test workflow, execute, confirm green
- [ ] Layer 2: delete test workflow + temp credential
- [ ] Layer 3a: backend health 200
- [ ] Layer 3b: n8n health ok
- [ ] Layer 3c: `GDA.cron.system-watchdog` next execution green
- [ ] Capture post-state snapshot
- [ ] Commit execution record PR
- [ ] If anything fails → `docker network disconnect n8n_default gda-postgres`
