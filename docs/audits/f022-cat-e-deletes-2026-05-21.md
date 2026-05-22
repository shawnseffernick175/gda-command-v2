# F-022 Category E — Utility Workflow Deletions

**Date:** 2026-05-22 (executed ~01:27 UTC)
**Author:** Devin (automated execution)
**Authorization:** Architect (Shawn) approved all 13 deletions

---

## Pre-State Snapshot

| # | ID | Name | Active | Execs | Nodes | Webhook Path | GDA PG |
|---|-----|------|--------|-------|-------|-------------|--------|
| 1 | alHJibzND41T6p93 | GDA.oneshot.embed-capture-plans | true | 0 | 5 | gda-embed-cp | ✓ |
| 2 | V665zkbwqxWuvAFJ | GDA.oneshot.write-jsx-s202 | true | 0 | 3 | gda-write-jsx-s202 | — |
| 3 | nV36K8LgL31nY37b | GDA.ingest.govtribe-zapier | true | 0 | 3 | govtribe-ingest | — |
| 4 | vZE5yJhvMvhQUsXx | GDA.api.intelligence-dashboard | true | 0 | 4 | gda-intel-dashboard | ✓ |
| 5 | 43YhEBU38pKBrqcv | GDA.api.target-agencies 2 | true | 0 | 4 | gda-target-agencies | ✓ |
| 6 | o1XU0vwmF1zBSG4S | GDA.api.landing-brief | true | 0 | 6 | gda-landing-brief | — |
| 7 | qyOybkM9DIHWoLKy | GDA.api.scan-history | true | 0 | 4 | gda-scan-history | ✓ |
| 8 | jC1lR5zpO7IaZqKa | GDA.cron.forecast-ingest | true | 0 | 7 | gda-forecast-ingest | ✓ |
| 9 | 1NQhq7rU89m23Zop | GDA.api.chart-generator | true | 0 | 4 | gda-chart | — |
| 10 | MSwEgLTafx9ASXyJ | GDA.batch.bulk-data-ingest | true | 0 | 6 | gda-bulk-ingest | — |
| 11 | MP4p5WX1GRhWNFyv | GDA.api.smart-recommender | true | 0 | 10 | gda-recommend | — |
| 12 | nLWF3YyCQEnNWo6K | GDA.api.priority-score-engine | true | 0 | 8 | gda-score-v21 | — |
| 13 | 6iVNBdDAmzxX2Hc1 | GDA.auto.stage-audit-logger | true | 0 | 4 | gda-stage-audit | — |

### Classification Source

- **DELETE (3):** Items 1-3 — oneshot utilities or superseded integrations (Cat E assessment PR #280)
- **INVESTIGATE → DELETE (10):** Items 4-13 — no backend code reference, 0 executions, architect-reviewed and approved for deletion

### KEEP (not touched)

| ID | Name | Reason |
|----|------|--------|
| dKibEwHO773kehFg | GDA.api.doc-compare | 16-node planned doc-diff feature |
| 8UPZHbcTwJstPKAS | GDA.api.doc-ingest | 17-node planned doc-ingest feature |
| yMo7WrELV8JVOi2M | GDA.intel.an1-incumbent-win-themes | Recent intel analysis work |

---

## Archive Paths (VPS)

All 13 workflow JSONs exported before deletion:

```
/tmp/cat-e-archive/alHJibzND41T6p93.json   (6,393 bytes)
/tmp/cat-e-archive/V665zkbwqxWuvAFJ.json   (3,976 bytes)
/tmp/cat-e-archive/nV36K8LgL31nY37b.json   (4,852 bytes)
/tmp/cat-e-archive/vZE5yJhvMvhQUsXx.json  (10,720 bytes)
/tmp/cat-e-archive/43YhEBU38pKBrqcv.json   (7,162 bytes)
/tmp/cat-e-archive/o1XU0vwmF1zBSG4S.json  (13,734 bytes)
/tmp/cat-e-archive/qyOybkM9DIHWoLKy.json   (6,777 bytes)
/tmp/cat-e-archive/jC1lR5zpO7IaZqKa.json  (11,730 bytes)
/tmp/cat-e-archive/1NQhq7rU89m23Zop.json   (8,903 bytes)
/tmp/cat-e-archive/MSwEgLTafx9ASXyJ.json   (9,938 bytes)
/tmp/cat-e-archive/MP4p5WX1GRhWNFyv.json  (16,147 bytes)
/tmp/cat-e-archive/nLWF3YyCQEnNWo6K.json  (17,767 bytes)
/tmp/cat-e-archive/6iVNBdDAmzxX2Hc1.json   (5,915 bytes)
```

**Note:** Archives are in `/tmp/` (volatile). Copy to a persistent path if long-term retention is wanted.

---

## Backend Registry Changes

### Removed Entries

1. **`govtribe-ingest`** — `packages/backend/src/lib/webhook-registry.ts` lines 253-260
   - Status was `live`, mapped to `GDA.ingest.govtribe-cron` (Cat D deleted workflow)
   - Actual workflow being deleted here is `GDA.ingest.govtribe-zapier` which shared the path
   - The cron version (`GDA.ingest.govtribe-cron`, ID `5KuF4KZ8uxYcbUN5`) was already deleted in Cat D (PR #279)

2. **`gda-smart-recommender`** — `packages/backend/src/lib/webhook-registry.ts` lines 262-269
   - Status was `planned`, mapped to `GDA.api.smart-recommender`
   - Actual n8n workflow used path `gda-recommend` (not `gda-smart-recommender`)
   - `enrichments.ts` line 62 calls `callWebhook("gda-smart-recommender", ...)` — this already 404'd against n8n (path mismatch). The route has a graceful fallback returning `{ recommendations: [], source: "db" }`

### Updated Tests

- `packages/backend/src/__tests__/govtribe-ingest.test.ts`:
  - Registry presence test → changed to verify `govtribe-ingest` is `undefined`
  - Registry-reflects-cron test → changed to verify entry removed
  - All 44 tests pass

### Backend Verification

- `npx tsc --noEmit` in `packages/backend`: **PASS** (clean compile, 0 errors)
- `npx vitest run govtribe-ingest.test.ts`: **44 tests passed**

---

## API Delete Responses

All 13 returned HTTP 200:

| ID | Name | HTTP |
|----|------|------|
| alHJibzND41T6p93 | GDA.oneshot.embed-capture-plans | 200 |
| V665zkbwqxWuvAFJ | GDA.oneshot.write-jsx-s202 | 200 |
| nV36K8LgL31nY37b | GDA.ingest.govtribe-zapier | 200 |
| vZE5yJhvMvhQUsXx | GDA.api.intelligence-dashboard | 200 |
| 43YhEBU38pKBrqcv | GDA.api.target-agencies 2 | 200 |
| o1XU0vwmF1zBSG4S | GDA.api.landing-brief | 200 |
| qyOybkM9DIHWoLKy | GDA.api.scan-history | 200 |
| jC1lR5zpO7IaZqKa | GDA.cron.forecast-ingest | 200 |
| 1NQhq7rU89m23Zop | GDA.api.chart-generator | 200 |
| MSwEgLTafx9ASXyJ | GDA.batch.bulk-data-ingest | 200 |
| MP4p5WX1GRhWNFyv | GDA.api.smart-recommender | 200 |
| nLWF3YyCQEnNWo6K | GDA.api.priority-score-engine | 200 |
| 6iVNBdDAmzxX2Hc1 | GDA.auto.stage-audit-logger | 200 |

---

## Post-State Verification

### 404 Confirmation

All 13 IDs return HTTP 404 on `GET /api/v1/workflows/{id}`.

### Endpoint Health

| Endpoint | Status |
|----------|--------|
| `gda.csr-llc.tech/health` | HTTP 200 |
| `n8n.csr-llc.tech/healthz` | HTTP 200 |
| `mcp.csr-llc.tech/mcp` | HTTP 200 (JSON-RPC) |

### Canary Workflows

| Canary | Last Execution | Status |
|--------|---------------|--------|
| GDA.cron.system-watchdog (LPUSYd4Vpph1Qg7n) | 2026-05-22T01:20:57Z | ✅ success |
| GDA.cron.change-detector (Zb2quk78c5mszZ2C) | 2026-05-22T01:25:15Z | ✅ success |

### Workflow Count Delta

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Active | 171 | 158 | -13 |
| Inactive | 0 | 0 | 0 |
| Total | 171 | 158 | -13 |

---

## F-022 Cumulative Lineage

| Category | Scope | Deletions |
|----------|-------|-----------|
| Cat A (DEAD) | 2 never-executed workflows | 2 (PR #274) |
| Cat B (ORPHAN) | 4 orphan/dormant workflows | 4 (PR #274) |
| Cat C (VERIFY) | 171 active workflows health check | 0 (re-check 2026-05-28, Issue #275) |
| Cat D (STALE INACTIVE) | 8 inactive workflows | 8 (PR #279) |
| Cat E (UTILITY) | 13 manual/webhook-only utilities | **13 (this PR)** |
| **TOTAL** | | **27 workflows deleted** |

**Remaining fleet:** 158 active, 0 inactive.
