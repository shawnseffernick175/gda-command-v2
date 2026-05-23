# F-026 Step 4 — Production Credential Cutover Runbook

**Author:** Devin  
**Date:** 2026-05-23  
**Status:** READY — pending architect approval (Step 4 PR 3)  
**Plan reference:** docs/runbooks/f026-step4-plan.md (PR #298)  
**Script:** scripts/f026/step4-credential-cutover.sh  
**Rehearsal proof:** docs/audits/f026-step4-staging-rehearsal-20260523.md

---

## Overview

This runbook documents the exact procedure for the production credential cutover:
editing credential `HwronxMmGY5XDGEt` to point all 122 workflows from
`n8n-envision-postgres-1/n8n` to `gda-postgres/gda_command`, plus rebuilding
gda-backend onto post-PR#288 code.

**Estimated pause window:** 3-5 minutes (based on staging rehearsal)

---

## Prerequisites

| # | Prerequisite | Verification |
|---|-------------|--------------|
| 1 | Step 3b closed (all 4 PRs merged) | PR #299, #300, #301, #302 merged |
| 2 | 58 tables exist on gda_command | `scripts/f026/step4-credential-cutover.sh --target=prod` Phase 0a |
| 3 | 122 workflows use HwronxMmGY5XDGEt | Phase 0b confirms |
| 4 | gda-backend healthy | `curl gda.csr-llc.tech/health` → 200 |
| 5 | gda-postgres healthy | `docker inspect gda-postgres --format='{{.State.Health.Status}}'` |
| 6 | n8n-envision-postgres-1 running | `docker ps \| grep n8n-envision-postgres-1` |
| 7 | Staging rehearsal passed | This PR's audit doc |

---

## Procedure

### Phase 0 — Pre-Flight Audit (no writes)

```bash
# SSH to VPS
ssh root@srv1397562

# Run pre-flight only (script aborts on any failure)
# Or run manually:

# 0a. Verify all 58 tables exist
docker exec gda-postgres psql -U gda -d gda_command -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public'
  AND table_name IN (
    'daily_trends','ft_opportunity_signal','ft_signal_source',
    'gda_action_items','gda_active_contracts','gda_capture_plans',
    'gda_competitor_cache','gda_competitor_watchlist','gda_contacts',
    'gda_dashboard_intel_cache','gda_embeddings','gda_error_log',
    'gda_intelligence_log','gda_learned_weights','gda_morning_briefings',
    'gda_opportunity_alerts','gda_opportunity_tracker','gda_relationships',
    'gda_risk_register','gda_saved_opportunities','gda_teaming_partners',
    'gda_touchpoints','gda_trend_arrays','gda_wargames',
    'gda_win_loss','gda_win_loss_db','govtribe_cache','opportunity_alerts',
    'gda_action_history','gda_ai_feedback','gda_aop_tracker',
    'gda_approval_queue','gda_capture_lessons','gda_chat_history',
    'gda_clause_library','gda_competitor_crawls','gda_compliance_matrices',
    'gda_contract_vehicles','gda_daily_briefings','gda_daily_briefs',
    'gda_deep_research','gda_dept_market','gda_discussions',
    'gda_doc_inbox','gda_e2e_reports','gda_feedback',
    'gda_health_scans','gda_idiq_tracker','gda_incumbent_analysis',
    'gda_knowledge_base','gda_learning_log','gda_meeting_notes',
    'gda_mega_cache','gda_naics_tracking','gda_ndaa_intel',
    'gda_ooda_loops','gda_prompt_architect_memory','gda_pwin_scores'
  )
  ORDER BY table_name;"
# Expected: 58 rows. HALT if any missing.

# 0b. Verify workflow count
docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -tAc "
  SELECT COUNT(DISTINCT id) FROM workflow_entity
  WHERE nodes::text LIKE '%HwronxMmGY5XDGEt%';"
# Expected: 122. HALT if mismatch.

# Confirm yK1VVsSN3tn0baVm not referenced
docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -tAc "
  SELECT COUNT(*) FROM workflow_entity
  WHERE nodes::text LIKE '%yK1VVsSN3tn0baVm%';"
# Expected: 0.

# 0c. Backend health
curl -s gda.csr-llc.tech/health
# Expected: 200 with healthy databases

# 0d. Snapshot baseline row counts
docker exec gda-postgres psql -U gda -d gda_command -c "
  SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"
```

**HALT GATES:** Stop if any of: 58 tables missing, workflow count ≠ 122, backend not 200.

---

### Phase 1 — Writer Pause

```bash
# Get N8N API key
N8N_API_KEY=$(grep N8N_API_KEY /root/n8n-envision/.env | cut -d= -f2 | tr -d '"' | tr -d "'")

# Record pause timestamp
echo "PAUSE START: $(TZ=America/New_York date '+%Y-%m-%d %H:%M:%S %Z')"

# Get active HwronxMmGY5XDGEt workflow IDs (excluding canary LPUSYd4Vpph1Qg7n)
WRITER_IDS=$(docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -tAc "
  SELECT id FROM workflow_entity
  WHERE active=true
    AND nodes::text LIKE '%HwronxMmGY5XDGEt%'
    AND id != 'LPUSYd4Vpph1Qg7n'
  ORDER BY id;")

# Deactivate each writer
for WF_ID in $WRITER_IDS; do
  WF_ID=$(echo "$WF_ID" | tr -d '[:space:]')
  [ -z "$WF_ID" ] && continue
  docker exec n8n-envision-n8n-1 wget -qO- \
    --post-data="" \
    --header="accept: application/json" \
    --header="X-N8N-API-KEY: $N8N_API_KEY" \
    "http://localhost:5678/api/v1/workflows/$WF_ID/deactivate" > /dev/null 2>&1
  echo "  Paused: $WF_ID"
done

# Quiesce window — let in-flight writes drain
sleep 10
echo "QUIESCE COMPLETE"
```

**DO NOT pause** GDA.cron.system-watchdog (LPUSYd4Vpph1Qg7n) — it is the canary.

---

### Phase 2 — Credential Cutover (THE ATOMIC OPERATION)

```bash
echo "CUTOVER START: $(TZ=America/New_York date '+%Y-%m-%d %H:%M:%S %Z')"

# Edit credential HwronxMmGY5XDGEt
# FROM: n8n-envision-postgres-1 / n8n (pre-cutover)
# TO:   gda-postgres / gda_command (post-cutover)
#
# Method: n8n REST API PATCH (session cookie or API key)
# n8n loads credentials fresh on each execution — no n8n restart needed

docker exec n8n-envision-n8n-1 wget -qO- \
  --method=PATCH \
  --body-data='{"name":"GDA Postgres","type":"postgres","data":{"host":"gda-postgres","port":5432,"database":"gda_command","user":"gda","password":"<PROD_PASSWORD>"}}' \
  --header="accept: application/json" \
  --header="Content-Type: application/json" \
  --header="X-N8N-API-KEY: $N8N_API_KEY" \
  "http://localhost:5678/api/v1/credentials/HwronxMmGY5XDGEt"

echo "CUTOVER COMPLETE: $(TZ=America/New_York date '+%Y-%m-%d %H:%M:%S %Z')"
```

**WARNING:** Replace `<PROD_PASSWORD>` with actual gda_command password before execution.

---

### Phase 3 — Backend Rebuild + Restart

```bash
cd /root/gda-command-v2
git pull origin main

# Build from post-PR#288 code
docker build -t gda-backend:latest -f packages/backend/Dockerfile .

# Recreate backend container with new image
cd /root/gda-command-v2
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate gda-backend

# Wait for health
for i in $(seq 1 30); do
  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://gda.csr-llc.tech/health 2>/dev/null || echo "000")
  echo "  Health check $i: $HEALTH"
  [ "$HEALTH" = "200" ] && break
  sleep 1
done

# HALT if not healthy after 30s — DO NOT auto-rollback
if [ "$HEALTH" != "200" ]; then
  echo "HALT: Backend not healthy after 30s (got $HEALTH)"
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "MANUAL INTERVENTION REQUIRED — system is in half-cut-over state:"
  echo "  - Credential HwronxMmGY5XDGEt points at NEW target (gda-postgres/gda_command)"
  echo "  - Backend container is NOT healthy"
  echo "  - Writers remain PAUSED"
  echo ""
  echo "To roll back manually:"
  echo "  scripts/f026/step4-credential-cutover.sh --target=prod --rollback"
  echo "  Then: docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate gda-backend"
  echo "  Then re-activate writers (see Phase 5 below)"
  echo ""
  echo "DO NOT unpause writers until backend is healthy and credential state is resolved."
  echo "═══════════════════════════════════════════════════════════════"
  exit 1
fi
```

---

### Phase 4 — Canary Trigger

```bash
# Manually trigger system-watchdog for first-after-cutover signal
docker exec n8n-envision-n8n-1 wget -qO- \
  --post-data="" \
  --header="accept: application/json" \
  --header="X-N8N-API-KEY: $N8N_API_KEY" \
  "http://localhost:5678/api/v1/workflows/LPUSYd4Vpph1Qg7n/activate"

echo "CANARY TRIGGERED — check n8n execution log"
```

---

### Phase 5 — Writer Unpause

```bash
echo "UNPAUSE START: $(TZ=America/New_York date '+%Y-%m-%d %H:%M:%S %Z')"

for WF_ID in $WRITER_IDS; do
  WF_ID=$(echo "$WF_ID" | tr -d '[:space:]')
  [ -z "$WF_ID" ] && continue
  docker exec n8n-envision-n8n-1 wget -qO- \
    --post-data="" \
    --header="accept: application/json" \
    --header="X-N8N-API-KEY: $N8N_API_KEY" \
    "http://localhost:5678/api/v1/workflows/$WF_ID/activate" > /dev/null 2>&1
  echo "  Resumed: $WF_ID"
done

echo "UNPAUSE COMPLETE: $(TZ=America/New_York date '+%Y-%m-%d %H:%M:%S %Z')"
```

---

### Phase 6 — Post-Cutover Verification

```bash
# 6a. Backend health
curl -s gda.csr-llc.tech/health | python3 -m json.tool

# 6b. Database health
docker inspect gda-postgres --format='{{.State.Health.Status}}'

# 6c. Canary (system-watchdog) last run within 10min
# Check n8n execution log for LPUSYd4Vpph1Qg7n

# 6d. Change-detector active within 5min after unpause
# Check n8n execution log for Zb2quk78c5mszZ2C

# 6e. Connection target verification
# Pick 3 workflows, check last execution logs to confirm they hit gda-postgres

# 6f. n8n shadow tables untouched
# Verify no new writes to n8n-envision-postgres-1/n8n tables since cutover
```

---

## Halt Conditions

| # | Condition | Phase | Action |
|---|-----------|-------|--------|
| 1 | Any of 58 tables missing on gda_command | 0a | ABORT — do not proceed |
| 2 | Workflow count ≠ 122 | 0b | ABORT — investigate |
| 3 | Backend health ≠ 200 | 0c | ABORT — fix backend first |
| 4 | Credential edit API fails | 2 | ABORT — do not unpause |
| 5 | Backend doesn't come healthy in 30s | 3 | ROLLBACK (see below) |
| 6 | Canary fails post-cutover | 4 | INVESTIGATE — consider rollback |
| 7 | Any writer fails first post-resume run | 5 | INVESTIGATE — consider rollback |

---

## Rollback Procedure

If anything goes wrong after the credential edit:

```bash
# 1. Edit credential back to pre-cutover target
docker exec n8n-envision-n8n-1 wget -qO- \
  --method=PATCH \
  --body-data='{"name":"GDA Postgres","type":"postgres","data":{"host":"postgres","port":5432,"database":"n8n","user":"n8n","password":"<N8N_DB_PASSWORD>"}}' \
  --header="accept: application/json" \
  --header="Content-Type: application/json" \
  --header="X-N8N-API-KEY: $N8N_API_KEY" \
  "http://localhost:5678/api/v1/credentials/HwronxMmGY5XDGEt"

# 2. Recreate backend on old image (if image was replaced)
cd /root/gda-command-v2
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate gda-backend

# 3. Wait for health
for i in $(seq 1 30); do
  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://gda.csr-llc.tech/health 2>/dev/null || echo "000")
  [ "$HEALTH" = "200" ] && break
  sleep 1
done

# 4. Unpause all writers
for WF_ID in $WRITER_IDS; do
  WF_ID=$(echo "$WF_ID" | tr -d '[:space:]')
  [ -z "$WF_ID" ] && continue
  docker exec n8n-envision-n8n-1 wget -qO- \
    --post-data="" \
    --header="accept: application/json" \
    --header="X-N8N-API-KEY: $N8N_API_KEY" \
    "http://localhost:5678/api/v1/workflows/$WF_ID/activate" > /dev/null 2>&1
done

echo "ROLLBACK COMPLETE — system restored to pre-cutover state"
```

**Or use the script:**
```bash
scripts/f026/step4-credential-cutover.sh --target=prod --rollback
```

### Rollback Proof

Staging rehearsal confirmed (2026-05-23):
- Credential edit is reversible (< 1 second)
- Rollback + re-cutover cycle tested end-to-end
- No data loss on rollback
- No restart required for n8n (credentials loaded fresh per execution)

---

## Decision Tree: Rollback vs Continue

```
Phase 2 credential edit failed?
  → ABORT, don't unpause, investigate API error

Phase 3 backend not healthy in 30s?
  → ROLLBACK credential, restart on old image, unpause

Phase 4 canary fails?
  → Check if failure is DB-related (connection) vs query-related (data)
  → If DB connection: ROLLBACK
  → If data/query: likely fixable, investigate before rollback

Phase 5 writers fail post-resume?
  → If > 3 writers fail: ROLLBACK
  → If 1-2 writers fail: investigate individually, may be transient
```

---

## Post-Cutover Monitoring (24h)

After successful cutover, monitor for 24 hours:

1. **system-watchdog** — should fire every 10 minutes without errors
2. **change-detector** — should fire every 5 minutes
3. **gda-backend /health** — should stay 200
4. **n8n error rate** — watch for elevated workflow failures
5. **gda_command row counts** — should grow normally (writers active)
6. **n8n DB shadow tables** — should NOT receive new writes
