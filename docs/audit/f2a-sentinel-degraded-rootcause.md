# F-2A: Sentinel Degraded Root-Cause Analysis

**Date:** May 27, 2026 11:00 AM EST  
**Author:** Devin (automated investigation)  
**Status:** Diagnosis complete — awaiting review before remediation

---

## Executive Summary

Sentinel reports `overall_status = down` with 3 degraded/down components:

| Component | Status | Detail |
|-----------|--------|--------|
| `writers_24h` | **down** | 7.0% error rate (46/659) |
| `source_health` | **degraded** | no source health snapshots recorded yet |
| `secret_expiry` | **degraded** | n8n API key expiring in 12 days |

**Root causes:**
1. `writers_24h` — **transient deployment errors** from F-020 gda-postgres downtime (03:00–05:00 UTC). Steady-state error rate is ~0.2%. Will self-heal once the 24h window slides past the deployment errors.
2. `source_health` — **dead writer**. The `POST /api/qa/source-health/snapshot` endpoint exists but no n8n workflow was ever created to call it. Table has 0 rows since creation.
3. `secret_expiry` — **real signal**. n8n API key `Devin-Rotated` expires in 12 days. Separate from this ticket but worth noting.

---

## Component 1: `writers_24h`

### Probe Definition

**Source:** `packages/backend/src/lib/health-sentinel.ts:198–235`

The probe queries the n8n `execution_entity` table for all workflow executions in the last 24 hours:

```sql
SELECT w.name AS wf_name,
  COUNT(*) FILTER (WHERE e.status = 'error') AS errors,
  COUNT(*) AS total
FROM execution_entity e
JOIN workflow_entity w ON e."workflowId" = w.id
WHERE e."startedAt" > NOW() - INTERVAL '24 hours'
  AND e."workflowId" NOT IN ('LPUSYd4Vpph1Qg7n')  -- exclude watchdog
GROUP BY w.name
```

Post-query filtering (lines 148–176) excludes workflows matching `/\.error\.handler$/i` or `/error[_-]handler/i` (currently catches `GDA.error.handler`).

**Thresholds:**
- `< 1%` → healthy
- `≥ 1%` and `< 5%` → degraded
- `≥ 5%` → down

### Signal Source Data

Hourly error distribution for top contributors (24h ending May 27, 2:55 PM UTC):

| Hour (UTC) | change-detector (5min) | stage-auto-promote (15min) | data-sync (30min) | Others |
|------------|----------------------|--------------------------|-------------------|--------|
| 14:00 May 26 – 02:00 May 27 | 0 errors | 0 errors | 0 errors | 0 |
| **03:00 May 27** | **7/12** | **2/4** | **1/2** | 0 |
| **04:00 May 27** | **11/12** | **4/4** | **2/2** | 1 |
| **05:00 May 27** | **2/12** | **1/4** | **0/2** | 0 |
| 06:00 – 14:00 May 27 | 0 errors | 0 errors | 0 errors | scattered 1-offs |

**All cron workflow errors are concentrated in the 03:00–05:00 UTC window** — this is the F-020 VPS recovery period when `gda-postgres` was down/being recreated (port conflict with n8n-envision-postgres-1).

Scattered API workflow errors (14:00 UTC) are from the manual E2E test trigger — known functional failures (not auth-related), not indicative of system degradation.

### 7-Day Error Rate Trend

| Day | Errors | Total | Rate | Notes |
|-----|--------|-------|------|-------|
| May 21 | 1 | 602 | 0.2% | Normal operations |
| May 22 | 0 | 663 | 0.0% | Normal operations |
| May 23 | 2 | 634 | 0.3% | Normal operations |
| May 24 | 25 | 660 | 3.8% | Deployment activity (F-035/F-029) |
| May 25 | 1 | 657 | 0.2% | Normal operations |
| May 26 | 38 | 690 | 5.5% | Deployment activity (F-037/F-036a) |
| May 27 | 86 | 472 | 18.2% | F-020 gda-postgres downtime |

*Note: Includes GDA.error.handler (excluded by probe regex). Actual probe rates are lower.*

**Pattern:** The persistent "2.4% baseline" is not a steady-state — it's the tail of deployment-induced error spikes. Since Phase 1 involved frequent deployments (almost daily), the 24h window always contained some deployment errors, creating the appearance of a permanent degradation.

### Root Cause

**Probe bug? No.** The probe accurately measures n8n execution failures.

**Real write failures? Partially.** The errors during 03:00–05:00 UTC were real Postgres connection failures (container was down). But they were expected/transient — caused by planned infrastructure work (F-020), not application bugs.

**Threshold misconfiguration? Partially.** The 1% degraded threshold is correct for detecting real operational issues, but it cannot distinguish deployment-induced transient errors from persistent failures.

### Recommended Fix

**Option A (preferred) — No probe change needed.** The error rate will self-heal to ~0.2% once the F-020 deployment errors age out of the 24h window (~03:00 UTC May 28). With Phase 2 deployments being less frequent than Phase 1, the baseline should stay well under 1%.

**Option B — Add deployment-window awareness.** If deployments remain frequent, the probe could exclude the first N minutes after a backend restart by checking `uptimeSec` from the `/health` endpoint and reducing the lookback window accordingly. This adds complexity with minimal benefit now.

**Option C — Reduce lookback window.** Change from 24h to 6h. This makes the probe recover faster from transient events but also makes it less sensitive to low-frequency recurring issues.

**Recommendation: Option A** — wait for self-healing. Verify at ~03:00 UTC May 28 that writers_24h returns to healthy. If Phase 2 deployment cadence proves problematic, revisit Option B/C.

---

## Component 2: `source_health`

### Probe Definition

**Source:** `packages/backend/src/lib/health-sentinel.ts:303–321`

```typescript
async function probeSourceHealth(): Promise<ProbeResult> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT DISTINCT ON (source) source, status, snapshot_at
     FROM source_health_snapshots
     ORDER BY source, snapshot_at DESC`,
  );
  const rows = result.rows;
  // computeSourceHealthStatus returns "degraded" if rows.length === 0
  const { status, detail } = computeSourceHealthStatus(rows);
  return { name: "source_health", status, latency_ms: ..., detail };
}
```

The `computeSourceHealthStatus` function (lines 180–196) returns `degraded` with "no source health snapshots recorded yet" when the table is empty.

### Signal Source Data

```sql
SELECT COUNT(*) FROM source_health_snapshots;
-- Result: 0
```

The table was created by migration 054 (`054_source_health_snapshots.sql`) but has **never received any data**.

### Writer Analysis

**Backend endpoint exists:** `POST /api/qa/source-health/snapshot` (`packages/backend/src/routes/qa.ts:539–810`)  
- Requires `x-gda-key` header auth
- Queries `gov_source_feeds` table, computes per-source health metrics (records_last_7d, records_last_30d, etc.)
- Writes snapshot rows to `source_health_snapshots`
- Returns aggregated health status

**No caller exists:** Searched all n8n workflows — none call this endpoint:
```sql
SELECT id, name FROM workflow_entity WHERE nodes::text ILIKE '%source-health%';
-- Result: 0 rows
```

The `GDA.cron.health-scan-daily` workflow (`gMEwjeBZbC4GzL3N`) tests webhook availability, NOT source health. It calls `GDA.api.health-scan` which checks if webhook endpoints are responding, not the backend source-health API.

**Has the writer ever worked?** No. Zero rows in the table since creation (migration 054, merged ~May 14).

### Root Cause

**Dead writer.** The probe expects snapshot data from `source_health_snapshots`, and the backend has an endpoint to generate those snapshots, but no cron job or n8n workflow was ever created to trigger it. The feature was shipped with:
- ✓ Schema (migration 054)
- ✓ Write endpoint (`POST /api/qa/source-health/snapshot`)
- ✓ Read endpoint (via sentinel probe + QA dashboard)
- ✗ **Missing: scheduled caller** — nothing invokes the write endpoint

### Recommended Fix

**Option A (preferred) — Inline the snapshot logic into sentinel.** Move the source health computation from the `POST /api/qa/source-health/snapshot` endpoint directly into `probeSourceHealth()`. When sentinel runs, it:
1. Queries `gov_source_feeds` for source metadata
2. Computes freshness/health per source
3. Writes a snapshot row to `source_health_snapshots` (for history/dashboard)
4. Returns the health status directly

This eliminates the dependency on an external cron workflow and makes sentinel self-contained.

**Option B — Create an n8n cron workflow.** Build a workflow that calls `POST /api/qa/source-health/snapshot` every 6–12 hours. Simpler but adds another moving part that can break independently.

**Recommendation: Option A** — inline into sentinel. This follows the same pattern as the other probes (postgres, n8n_canary, writers_24h all compute their status directly).

---

## Component 3: `secret_expiry` (bonus finding)

### Probe Definition

**Source:** `packages/backend/src/lib/health-sentinel.ts:383–437`

### Signal Source Data

```
secret_expiry: degraded — expiring <30d: n8n_api_key:Devin-Rotated(12d)
```

The n8n API key labeled "Devin-Rotated" (created during F-035 Wave 2.5 rotation on May 15, 2026) has a JWT `exp` claim that expires in ~12 days (approximately June 8, 2026).

### Root Cause

**Real signal.** The API key will genuinely expire. This was expected — the rotation used n8n's default JWT expiry. Need to either:
- Rotate the key before expiry
- Or configure n8n to issue longer-lived API keys

**Not blocking F-2A** — this is a separate maintenance item.

---

## Summary of Recommendations

| Component | Root Cause | Fix Type | Fix Description |
|-----------|-----------|----------|-----------------|
| `writers_24h` | Transient deployment errors | **No code change** | Self-heals by ~03:00 UTC May 28 |
| `source_health` | Dead writer (no cron trigger) | **Probe enhancement** | Inline source health computation into sentinel |
| `secret_expiry` | Real approaching expiry | **Separate ticket** | Rotate n8n API key before June 8 |

### Expected Post-Fix State

After implementing source_health fix and waiting for writers_24h self-healing:
- `writers_24h` → **healthy** (~0.2% steady-state)
- `source_health` → **healthy** (real-time computation)
- `secret_expiry` → **degraded** until key rotated (separate from F-2A)
- `overall_status` → **degraded** (due to secret_expiry) until key rotation
- `overall_status` → **healthy** after secret_expiry addressed

### To achieve F-2A acceptance (overall_status = healthy):
1. Implement source_health probe fix (PR 2)
2. Wait for writers_24h self-healing (~03:00 UTC May 28)
3. Rotate n8n API key before expiry (PR 3 or separate ticket)
4. Verify all components green

---

## Queries Used

All queries run against VPS `100.100.80.78` on May 27, 2026 at ~10:55 AM EST.

```sql
-- writers_24h error distribution by hour
SELECT date_trunc('hour', "startedAt") as hr,
  COUNT(*) FILTER (WHERE status = 'error') as errs,
  COUNT(*) as total
FROM execution_entity
WHERE "workflowId" = 'Zb2quk78c5mszZ2C'
  AND "startedAt" > NOW() - INTERVAL '24 hours'
GROUP BY hr ORDER BY hr;

-- source_health_snapshots count
SELECT COUNT(*) FROM source_health_snapshots;  -- 0

-- n8n workflows referencing source-health
SELECT id, name FROM workflow_entity
WHERE nodes::text ILIKE '%source-health%';  -- 0 rows

-- Fresh sentinel run
POST /api/sentinel/run (from inside gda-backend container)

-- 7-day error trend
SELECT date_trunc('day', "startedAt") as day,
  COUNT(*) FILTER (WHERE status = 'error') as errs, COUNT(*) as total
FROM execution_entity
WHERE "startedAt" > NOW() - INTERVAL '7 days'
  AND "workflowId" NOT IN ('LPUSYd4Vpph1Qg7n')
GROUP BY day ORDER BY day;
```
