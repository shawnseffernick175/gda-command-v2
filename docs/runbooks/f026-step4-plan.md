# F-026 Step 4 — Workflow Repointing: n8n Credential Cutover

**Author:** Devin  
**Date:** 2026-05-22  
**Status:** DRAFT — awaiting architect review  
**Parent issue:** F-026 (DB consolidation)  
**Prerequisite PRs:** #294 (Step 3 plan), #295 (Step 3 script + rehearsal), #296 (schema apply), #297 (prod data migration)

---

## 1. Preconditions

Before execution, verify each of the following. HALT on any failure.

### 1a. Step 3 closure state

```bash
# Verify 28 ADOPT tables populated, 4,562 row total
docker exec gda-postgres psql -U gda -d gda_command -t -c "
SELECT sum(cnt) FROM (
  SELECT count(*) AS cnt FROM gda_relationships UNION ALL
  SELECT count(*) FROM ft_signal_source UNION ALL
  SELECT count(*) FROM gda_touchpoints UNION ALL
  SELECT count(*) FROM ft_opportunity_signal UNION ALL
  SELECT count(*) FROM gda_risk_register UNION ALL
  SELECT count(*) FROM gda_opportunity_tracker UNION ALL
  SELECT count(*) FROM gda_capture_plans UNION ALL
  SELECT count(*) FROM gda_intelligence_log UNION ALL
  SELECT count(*) FROM gda_competitor_watchlist UNION ALL
  SELECT count(*) FROM opportunity_alerts UNION ALL
  SELECT count(*) FROM gda_competitor_cache UNION ALL
  SELECT count(*) FROM gda_action_items UNION ALL
  SELECT count(*) FROM gda_active_contracts UNION ALL
  SELECT count(*) FROM gda_dashboard_intel_cache UNION ALL
  SELECT count(*) FROM daily_trends UNION ALL
  SELECT count(*) FROM gda_opportunity_alerts UNION ALL
  SELECT count(*) FROM gda_morning_briefings UNION ALL
  SELECT count(*) FROM gda_learned_weights UNION ALL
  SELECT count(*) FROM gda_win_loss UNION ALL
  SELECT count(*) FROM gda_error_log UNION ALL
  SELECT count(*) FROM gda_saved_opportunities UNION ALL
  SELECT count(*) FROM gda_teaming_partners UNION ALL
  SELECT count(*) FROM gda_embeddings UNION ALL
  SELECT count(*) FROM govtribe_cache UNION ALL
  SELECT count(*) FROM gda_wargames UNION ALL
  SELECT count(*) FROM gda_win_loss_db UNION ALL
  SELECT count(*) FROM gda_trend_arrays UNION ALL
  SELECT count(*) FROM gda_contacts
) t;"
# Expect: >= 4562. Total may exceed 4,562 if writers have added rows since Step 3.
# HALT if total is LESS than 4,562 (would indicate data loss).
```

```bash
# Verify constraint checks still pass
# FK chain 1: gda_touchpoints → gda_relationships
docker exec gda-postgres psql -U gda -d gda_command -t -c "
SELECT count(*) FROM gda_touchpoints t
LEFT JOIN gda_relationships r ON t.relationship_id = r.id
WHERE r.id IS NULL AND t.relationship_id IS NOT NULL;"
# Expect: 0

# FK chain 2: ft_opportunity_signal → ft_signal_source
docker exec gda-postgres psql -U gda -d gda_command -t -c "
SELECT count(*) FROM ft_opportunity_signal s
LEFT JOIN ft_signal_source src ON s.source_id = src.source_id
WHERE src.source_id IS NULL AND s.source_id IS NOT NULL;"
# Expect: 0
```

**HALT if:** Total row count < 4,562, or any FK orphans detected.

### 1b. gda-backend health

```bash
curl -s https://gda.csr-llc.tech/health | python3 -c "import sys,json; print(json.load(sys.stdin))"
docker ps --filter name=gda-backend --format "{{.Names}} {{.Status}} {{.Image}}"
```

Record: container age, image ID, current uptime. The backend is running image
`gda-command-v2-backend:latest` (ImageID `sha256:1b8ca37f1e56...`), built 2026-05-20,
container created 2026-05-21T17:38:13Z. This is the **pre-PR#288 code**.

### 1c. Writer workflow status

```bash
# Verify all 17 writers from docs/audits/f026-step3-writer-workflows-20260522.md are active
# Use n8n API to check each
for WF_ID in ldVAxgDGuKJx4354 Qg55lRKjubgsvD28 9annZcPoqw0DaPKI PeLGDqgLAsEh5Gsd \
  BQFYbILTezLgqkDY 0E3lCtWt2rdJlMPY MJapg8dGkvEzLn0K M0xPvRs31zQOewfx \
  7gERqvfD6THg1gWf EcZWryEoS4zyAfGD geW4zw6lvkkizF82 IGw8FBZhZwnwiIe1 \
  Zb2quk78c5mszZ2C gMEwjeBZbC4GzL3N KIT8cj4V2cMFdSkA lU2uQfmQ6sch69TA \
  D6nZ235hSF4wGMb5; do
  curl -s "http://localhost:5678/api/v1/workflows/$WF_ID" \
    -H "X-N8N-API-KEY: $API_KEY" | python3 -c "
import sys,json; d=json.load(sys.stdin); print(d['id'], d['name'], 'active' if d['active'] else 'INACTIVE')"
done
```

**HALT if:** Any of the 17 writers is inactive (would indicate they weren't properly
resumed after Step 3).

### 1d. No in-flight writes

```bash
# Check last execution time for each writer. All should have completed > 30 seconds ago.
for WF_ID in ldVAxgDGuKJx4354 Qg55lRKjubgsvD28 ...; do
  curl -s "http://localhost:5678/api/v1/executions?workflowId=$WF_ID&limit=1&status=running" \
    -H "X-N8N-API-KEY: $API_KEY" | python3 -c "
import sys,json; d=json.load(sys.stdin); execs=d.get('data',[]); \
print(f'Running: {len(execs)}')"
done
# Expect: 0 running for all 17
```

**HALT if:** Any workflow has a running execution. Wait for it to complete before proceeding.

### 1e. Halt conditions summary

| # | Condition | Action |
|---|-----------|--------|
| 1 | ADOPT row total < 4,562 | HALT — data loss detected |
| 2 | FK orphans > 0 | HALT — constraint violation |
| 3 | gda-backend not healthy | HALT — backend issue |
| 4 | Any writer workflow inactive | HALT — Step 3 resume failure |
| 5 | Any writer workflow currently running | WAIT until completed, then proceed |

---

## 2. Scope — Exactly What Is Repointed

### 2a. The credential

| ID | Name | Type | Current Host | Target Host |
|----|------|------|-------------|-------------|
| HwronxMmGY5XDGEt | GDA Postgres | postgres | n8n-envision-postgres-1 | gda-postgres |

This is a **shared credential** used by **122 workflows** (121 active, 1 inactive).
Changing it repoints ALL 122 workflows in a single atomic operation.

### 2b. The 17 writer workflows (from Step 3 inventory)

All 17 use **only** HwronxMmGY5XDGEt. No workflow uses a second Postgres credential.

| # | Workflow | ID | Tables Written |
|---|----------|----|---------------|
| 1 | GDA.cron.auto-risk-generation | ldVAxgDGuKJx4354 | gda_risk_register |
| 2 | GDA.cron.deadline-escalation | Qg55lRKjubgsvD28 | gda_risk_register |
| 3 | GDA.cron.pipeline-health-digest | 9annZcPoqw0DaPKI | gda_risk_register |
| 4 | GDA.sched.opp-refresh | PeLGDqgLAsEh5Gsd | gda_opportunity_tracker |
| 5 | GDA.cron.broad-opp-search | BQFYbILTezLgqkDY | gda_opportunity_tracker |
| 6 | GDA.cron.capture-opp-sync | 0E3lCtWt2rdJlMPY | gda_opportunity_tracker |
| 7 | GDA.cron.fast-track-ingest | MJapg8dGkvEzLn0K | ft_signal_source, ft_opportunity_signal |
| 8 | GDA.cron.data-sync | M0xPvRs31zQOewfx | daily_trends, gda_trend_arrays, gda_learned_weights |
| 9 | GDA.cron.auto-capture-plan | 7gERqvfD6THg1gWf | gda_capture_plans |
| 10 | GDA.cron.comp-intel-daily-growth | EcZWryEoS4zyAfGD | gda_competitor_cache, gda_competitor_watchlist |
| 11 | GDA.api.comp-intel 2 | geW4zw6lvkkizF82 | gda_competitor_cache, gda_competitor_watchlist |
| 12 | GDA.cron.auto-opp-analysis | IGw8FBZhZwnwiIe1 | gda_intelligence_log, gda_action_items |
| 13 | GDA.cron.change-detector | Zb2quk78c5mszZ2C | gda_opportunity_alerts, opportunity_alerts |
| 14 | GDA.cron.health-scan-daily | gMEwjeBZbC4GzL3N | gda_error_log |
| 15 | GDA.api.intel-feed | KIT8cj4V2cMFdSkA | gda_dashboard_intel_cache, gda_morning_briefings |
| 16 | GDA.cron.stage-auto-promote | lU2uQfmQ6sch69TA | gda_opportunity_tracker |
| 17 | GDA.cron.daily-trends-collect | D6nZ235hSF4wGMb5 | daily_trends |

### 2c. The 105 reader/other workflows

The remaining 105 workflows use HwronxMmGY5XDGEt for **read-only** queries (SELECT via
`executeQuery` operation). These include all `GDA.api.*` endpoint workflows, dashboard
workflows, search workflows, and automation triggers. A full list by category:

**API/webhook workflows (69):** GDA.api.action-history, GDA.api.action-items 2,
GDA.api.agentic-chat, GDA.api.ai-feedback, GDA.api.aop-tracker,
GDA.api.approvals-queue, GDA.api.bd-activity-log, GDA.api.black-hat,
GDA.api.capture-hub, GDA.api.capture-intel, GDA.api.capture-intel-modules,
GDA.api.capture-plan, GDA.api.chat-simple, GDA.api.clause-library,
GDA.api.competitor-field, GDA.api.competitor-threat-score,
GDA.api.competitor-watchlist, GDA.api.compliance-matrix, GDA.api.contacts,
GDA.api.contracts, GDA.api.daily-actions, GDA.api.daily-brief,
GDA.api.daily-brief-reader, GDA.api.dashboard-intel 2, GDA.api.dashboard-mega,
GDA.api.data-learn, GDA.api.deep-research-history, GDA.api.discussions,
GDA.api.e2e-reports, GDA.api.email-drafter, GDA.api.embed-and-store,
GDA.api.error-log, GDA.api.export-excel, GDA.api.fast-track-needs (inactive),
GDA.api.govtribe-cache, GDA.api.health-scan, GDA.api.idiq-tracker,
GDA.api.incumbent-analysis, GDA.api.knowledge-base, GDA.api.launchpad,
GDA.api.launchpad-funnel, GDA.api.meeting-notes 2, GDA.api.morning-briefing,
GDA.api.naics 2, GDA.api.ndaa-far-ingest, GDA.api.ooda-loop 2,
GDA.api.opp-search, GDA.api.opp-tracker 2, GDA.api.opportunity-detail,
GDA.api.pipeline, GDA.api.platform-health, GDA.api.predictive-intel,
GDA.api.proactive-scan, GDA.api.proposals, GDA.api.pwin-calculator,
GDA.api.relationship-tracker, GDA.api.risk-intel, GDA.api.save-opp,
GDA.api.saved-opps, GDA.api.semantic-search, GDA.api.sitrep 2,
GDA.api.teaming-finder, GDA.api.teaming-scorer, GDA.api.trends,
GDA.api.vehicle-tracker, GDA.api.wargame, GDA.api.win-loss-db,
GDA.sub.dashboard-intel-deep, GDA.form.quick-entry

**Cron/scheduled workflows (26):** GDA.cron.amendment-monitor,
GDA.cron.auto-index-docs, GDA.cron.capture-gate-review,
GDA.cron.capture-milestone-alerts, GDA.cron.competitor-crawler,
GDA.cron.data-retention, GDA.cron.fpds-enrichment,
GDA.cron.idiq-task-order-alert, GDA.cron.learning-engine,
GDA.cron.master-scanner, GDA.cron.morning-intel-briefing,
GDA.cron.ndaa-ingest, GDA.cron.nightly-fy-revenue-calc,
GDA.cron.nightly-perplexity-research, GDA.cron.on-ramp-scanner,
GDA.cron.pipeline-coverage-check, GDA.cron.pwin-daily-loop,
GDA.cron.recompete-early-warning, GDA.cron.system-watchdog,
GDA.cron.weekly-comp-scan, GDA.cron.win-rate-weekly-digest,
GDA.sched.dept-market-refresh, GDA.sched.dept-opp-sweep,
GDA.sched.dhs-industry-day-monitor, GDA.sched.dpc-forecast-scraper,
GDA.sched.idiq-to-monitor

**Agent/auto/other (10):** GDA.agent.opp-classifier, GDA.auto.e2e-gemini-report,
GDA.auto.feedback-collector, GDA.bot.telegram-chat,
GDA.doctrine.pr-merge-draft, GDA.enrichment.capture-plan-cards,
GDA.error.handler, GDA.event.bidirectional-sync,
GDA.intel.an1-incumbent-win-themes, GDA.intel.morning-briefing-v1

> **Note:** GDA.cron.system-watchdog (LPUSYd4Vpph1Qg7n) uses HwronxMmGY5XDGEt for
> its DB health-check queries. It will be affected by the cutover but is NOT paused —
> see Section 6.

### 2d. Credential exclusion confirmation

| Credential | ID | Status |
|-----------|-----|--------|
| yK1VVsSN3tn0baVm | Postgres account | **NOT affected.** 0 workflows reference it. |

---

## 3. Approach — Credential Repoint (Recommended: Option A — Edit in Place)

### Option A: Edit HwronxMmGY5XDGEt in place ✅ RECOMMENDED

**What:** Change the `host` field from `n8n-envision-postgres-1` to `gda-postgres` in the
existing credential. Also update `database` from `n8n` to `gda_command`, `user` from `n8n`
to `gda`, and `password` to the gda user's password.

**Pros:**
- Atomic: one change, all 122 workflows repointed instantly
- Zero workflow JSON modifications required
- No ambiguous intermediate state (some workflows on old, some on new)
- Simple rollback: re-edit the same 4 fields back to original values

**Cons:**
- No n8n UI "undo" — rollback requires re-editing the credential
- Affects all 122 workflows simultaneously (but this is also a pro — no split-brain)

### Option B: Duplicate and swap ❌ NOT RECOMMENDED

**What:** Create a new credential "GDA Postgres (gda_command)" pointing at gda-postgres,
then update each workflow's node to reference the new credential.

**Cons:**
- 122 workflow JSON edits required (one per workflow)
- Each edit is an n8n API call with the full workflow body
- Risk of partial state: some workflows on old credential, some on new
- If any edit fails, complex rollback (which workflows were already swapped?)
- n8n API v1 uses PUT for workflow updates (not PATCH) — must send full workflow body
- Much more opportunity for mistakes

### Recommendation

**Option A.** It leaves fewer variables moving: one credential edit vs 122 workflow edits.
The rollback path (re-edit the credential) is equally simple for both options, but Option A
has no intermediate states to reason about.

### Credential field changes

| Field | Before | After |
|-------|--------|-------|
| host | n8n-envision-postgres-1 | gda-postgres |
| port | 5432 | 5432 |
| database | n8n | gda_command |
| user | n8n | gda |
| password | *(n8n user password)* | *(gda user password)* |
| ssl | false | false |

> **IMPORTANT:** The credential data in n8n is encrypted. The edit must be done through
> the n8n UI (Settings → Credentials → GDA Postgres → Edit) or via the n8n internal API
> that handles encryption. Direct SQL UPDATE on `credentials_entity.data` will NOT work
> because the payload is AES-encrypted with n8n's encryption key.

---

## 4. Connectivity Pre-Flight

### 4a. Network topology

```
n8n-envision-n8n-1:
  - n8n-envision_envision-internal: 172.20.0.3
  - n8n_default: 172.18.0.4

gda-postgres:
  - gda-command-v2_gda: 172.22.0.2
  - n8n_default: 172.18.0.7

Shared network: n8n_default
DNS: "gda-postgres" resolves from n8n container via Docker embedded DNS
```

**Verified:** `docker exec n8n-envision-n8n-1 nc -z -w5 gda-postgres 5432` → REACHABLE.

The n8n container and gda-postgres are both on the `n8n_default` Docker network. This was
established in F-026 Step 2 (PR #273). DNS resolution works — the n8n container can resolve
`gda-postgres` by container name.

### 4b. Authentication

```
pg_hba.conf on gda-postgres:
  host all all all scram-sha-256
```

This allows any host to connect as any user with password authentication (scram-sha-256).
The n8n container's IP (172.18.0.4) is within the `all` range.

### 4c. Grants

The `gda` user is the **owner** of all 28 ADOPT tables (verified via `pg_tables.tableowner`).
As owner, `gda` has full privileges: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
TRIGGER on all 28 tables. No additional GRANT statements needed.

### 4d. Non-ADOPT table writes

The 122 workflows that use HwronxMmGY5XDGEt also read/write to tables OUTSIDE the 28 ADOPT
set. These are the **original 86 gda_command application tables** that have always lived on
gda-postgres. Examples: `sam_opportunities`, `opportunities`, `sources`, `enrichment_log`,
etc. Since gda_command is already the home database for these tables, repointing the
credential to gda-postgres gives n8n access to BOTH the original 86 AND the 28 ADOPT tables
in a single connection.

**No grant gap exists.** The `gda` user owns all tables in gda_command.

### 4e. Pre-flight verification command

```bash
# From inside n8n container, verify gda user can connect and query an ADOPT table
docker exec n8n-envision-n8n-1 sh -c "
  PGPASSWORD='<gda_password>' psql -h gda-postgres -U gda -d gda_command \
    -c 'SELECT count(*) FROM gda_opportunity_tracker;'"
# Expect: 1780 (or current count)
```

> **Note:** The n8n Alpine container doesn't have `psql` installed. Use the `nc` test
> (Section 4a) for connectivity, and verify auth by running the query from gda-postgres
> itself or from the host via `docker exec`.

---

## 5. Backend Restart Plan

### 5a. Current state

| Item | Value |
|------|-------|
| Image | gda-command-v2-backend:latest |
| Image ID | sha256:1b8ca37f1e5651184c0f22e031e79d50d2d8710152750eef773756e6c86dcdbf |
| Image built | 2026-05-20 15:01:38 UTC |
| Container created | 2026-05-21T17:38:13Z |
| Code version | Pre-PR#288 (does not include migrations 057-084 code) |
| Restart policy | unless-stopped |

The backend needs to be **rebuilt** (not just restarted) to pick up main since PR #288.
A simple `docker restart gda-backend` would restart the same old image. We need
`docker compose build backend && docker compose up -d backend`.

### 5b. Restart timing: AFTER credential cutover

**Recommended order:** Pause → Backup → Credential repoint → Backend rebuild → Resume.

Rationale:
- The credential repoint is the critical cutover. Doing it while workflows are paused
  means no workflow tries to connect to the wrong DB during the transition.
- The backend rebuild happens while workflows are still paused — if the build fails, we
  can still revert the credential without any workflow having tried to use the new target.
- The backend reads from gda_command (always has). After the credential cutover, n8n
  workflows will ALSO read/write to gda_command. There's no conflict between the backend
  restart and the credential change — they're independent axes.

### 5c. Downtime expectation

- **Backend build:** 30-60 seconds (TypeScript compile + Docker image build)
- **Backend startup:** 5-10 seconds (Express server + migration check)
- **Total downtime on gda.csr-llc.tech:** ~45-90 seconds
- During this window, the frontend will show "Backend Unavailable" but n8n is unaffected
  (it's an independent container).

### 5d. Health check sequence (post-restart)

```bash
# 1. Container is running and healthy
docker ps --filter name=gda-backend --format "{{.Names}} {{.Status}}"
# Expect: "gda-backend Up X seconds (healthy)"

# 2. HTTP health endpoint
curl -s https://gda.csr-llc.tech/health | python3 -c "
import sys,json; d=json.load(sys.stdin); print('status:', d['data']['status'])"
# Expect: "status: ok"

# 3. Migration runner did NOT re-apply anything (all 88 already in schema_migrations)
docker logs gda-backend --tail 50 2>&1 | grep -i "migration"
# Expect: "All migrations already applied" or "0 new migrations"

# 4. Verify schema_migrations still = 88
docker exec gda-postgres psql -U gda -d gda_command -t -c "SELECT count(*) FROM schema_migrations;"
# Expect: 88
```

### 5e. Rollback if backend fails to start

```bash
# The old image is still cached locally
docker images gda-command-v2-backend --format "{{.ID}} {{.CreatedAt}}"
# Identify the previous image (sha256:1b8ca37f1e56...)

# Re-tag and restart with old image
docker tag sha256:1b8ca37f1e5651184c0f22e031e79d50d2d8710152750eef773756e6c86dcdbf \
  gda-command-v2-backend:rollback
docker stop gda-backend
docker run -d --name gda-backend-rollback \
  --network gda-command-v2_gda \
  --restart unless-stopped \
  <same env vars and volumes as original> \
  gda-command-v2-backend:rollback
```

> **Simplification:** Since the compose file exists at `/root/gda-command-v2/docker-compose.prod.yml`,
> a `git checkout <old-commit> && docker compose build backend && docker compose up -d backend`
> is the cleanest rollback path. The old commit is the one currently running (pre-PR#288).

---

## 6. Workflow Pause/Resume

Same 17 writer workflows as Step 3 (docs/audits/f026-step3-writer-workflows-20260522.md).

### 6a. Pause list

| # | Workflow | ID | Action |
|---|----------|----|--------|
| 1 | GDA.cron.auto-risk-generation | ldVAxgDGuKJx4354 | PAUSE |
| 2 | GDA.cron.deadline-escalation | Qg55lRKjubgsvD28 | PAUSE |
| 3 | GDA.cron.pipeline-health-digest | 9annZcPoqw0DaPKI | PAUSE |
| 4 | GDA.sched.opp-refresh | PeLGDqgLAsEh5Gsd | PAUSE |
| 5 | GDA.cron.broad-opp-search | BQFYbILTezLgqkDY | PAUSE |
| 6 | GDA.cron.capture-opp-sync | 0E3lCtWt2rdJlMPY | PAUSE |
| 7 | GDA.cron.fast-track-ingest | MJapg8dGkvEzLn0K | PAUSE |
| 8 | GDA.cron.data-sync | M0xPvRs31zQOewfx | PAUSE |
| 9 | GDA.cron.auto-capture-plan | 7gERqvfD6THg1gWf | PAUSE |
| 10 | GDA.cron.comp-intel-daily-growth | EcZWryEoS4zyAfGD | PAUSE |
| 11 | GDA.api.comp-intel 2 | geW4zw6lvkkizF82 | PAUSE |
| 12 | GDA.cron.auto-opp-analysis | IGw8FBZhZwnwiIe1 | PAUSE |
| 13 | GDA.cron.change-detector | Zb2quk78c5mszZ2C | PAUSE |
| 14 | GDA.cron.health-scan-daily | gMEwjeBZbC4GzL3N | PAUSE |
| 15 | GDA.api.intel-feed | KIT8cj4V2cMFdSkA | PAUSE |
| 16 | GDA.cron.stage-auto-promote | lU2uQfmQ6sch69TA | PAUSE |
| 17 | GDA.cron.daily-trends-collect | D6nZ235hSF4wGMb5 | PAUSE |

- **GDA.cron.system-watchdog (LPUSYd4Vpph1Qg7n):** NOT paused. Stays running as canary.
  It uses HwronxMmGY5XDGEt, so it will experience the credential cutover live. This is
  intentional — if the watchdog survives the cutover without errors, it's evidence the
  credential repoint is valid. If it fails, that's an immediate signal to roll back.
- **GDA.cron.change-detector (Zb2quk78c5mszZ2C):** PAUSED as #13. It's a writer.

### 6b. API method

```bash
# Pause: POST /api/v1/workflows/{id}/deactivate
# Resume: POST /api/v1/workflows/{id}/activate
# (PATCH is 405 on this n8n version — 2.21.5)
```

### 6c. Pause/resume verification

```bash
# After pause: expect 140 active (157 - 17)
curl -s "$N8N_API/workflows?active=true&limit=200" -H "X-N8N-API-KEY: $API_KEY" | \
  python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))"

# After resume: expect 157 active
```

---

## 7. Execution Order

### Phase A: Pause writer workflows

1. Verify preconditions (Section 1)
2. Capture pre-cutover active count (expect 157)
3. Pause 17 writers via `POST /deactivate`
4. Verify active count = 140
5. Wait 30 seconds for any in-flight executions to drain

### Phase B: Backup gda_command

```bash
/root/backup-before-migration.sh gda_command
```

This captures the post-Step-3 state as the rollback target.

### Phase C: Repoint credential

Edit HwronxMmGY5XDGEt via n8n UI:
1. Navigate to n8n.csr-llc.tech → Settings → Credentials → "GDA Postgres"
2. Change `host` from `n8n-envision-postgres-1` to `gda-postgres`
3. Change `database` from `n8n` to `gda_command`
4. Change `user` from `n8n` to `gda`
5. Change `password` to gda user's password
6. Save
7. Verify save was successful by testing the credential in n8n UI

> **Alternative (scripted):** n8n's internal REST API (not the public v1 API) can update
> credential data. This would be: `PUT /credentials/{id}` with the full credential body
> including the encrypted data. However, this requires the n8n encryption key and the
> correct payload format. The UI is safer for a one-time operation.

### Phase D: Verify credential (pre-resume)

While workflows are still paused:

```bash
# system-watchdog is still running — check if it fired successfully after the cutover
# Wait for one watchdog cycle (10 min) or check the last execution
curl -s "$N8N_API/executions?workflowId=LPUSYd4Vpph1Qg7n&limit=1" \
  -H "X-N8N-API-KEY: $API_KEY"
# Expect: most recent execution is post-cutover and status = "success"
# If status = "error" → HALT. The credential repoint may be wrong.
```

### Phase E: Restart gda-backend

```bash
cd /root/gda-command-v2
git pull origin main
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend
```

Wait for health check (Section 5d). HALT if backend doesn't come up healthy within 60
seconds.

### Phase F: Resume writer workflows

1. Resume 17 writers via `POST /activate` (same order as paused)
2. Verify active count = 157

### Phase G: Verification window

See Section 8.

---

## 8. Verification

### 8a. First-cycle monitoring (after resume)

For each of the 17 writer workflows, wait for one full execution cycle and verify:

```bash
# For each writer, get the first post-resume execution
curl -s "$N8N_API/executions?workflowId={ID}&limit=1" -H "X-N8N-API-KEY: $API_KEY"
# Verify: status = "success", no DB-related errors in the execution data
```

### 8b. Write target verification

Confirm writes land in gda-postgres/gda_command (not n8n-envision-postgres-1):

```bash
# Capture row counts on gda_command ADOPT tables
# Compare to pre-cutover counts — expect increase for active writer tables

# Capture row counts on n8n-envision-postgres-1 ADOPT tables
# Compare to pre-cutover counts — expect NO change (frozen)
# This is the critical test: if old DB counts increase, the cutover didn't work
```

### 8c. Spot-check records

Select 3+ specific records from gda_command and verify they match expected data:

```bash
# Example: latest gda_risk_register entry
docker exec gda-postgres psql -U gda -d gda_command -c "
SELECT id, title, status, updated_at FROM gda_risk_register ORDER BY updated_at DESC LIMIT 3;"

# Example: latest daily_trends entry
docker exec gda-postgres psql -U gda -d gda_command -c "
SELECT id, trend_date, updated_at FROM daily_trends ORDER BY updated_at DESC LIMIT 3;"
```

### 8d. Source DB freeze verification

```bash
# Row counts on n8n-envision-postgres-1 ADOPT tables should be FROZEN at Step 3 values
for t in gda_risk_register gda_opportunity_tracker daily_trends gda_action_items \
  gda_intelligence_log ft_opportunity_signal; do
  docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -t -c "SELECT count(*) FROM $t;"
done
# Compare to docs/audits/f026-step3-prod-presnapshot-20260522.md values
# If any count increased → HALT. Writes are still going to the old DB.
```

### 8e. Endpoint health

```bash
curl -s -o /dev/null -w "%{http_code}" https://gda.csr-llc.tech/health        # Expect: 200
curl -s -o /dev/null -w "%{http_code}" https://n8n.csr-llc.tech/healthz       # Expect: 200
curl -s -o /dev/null -w "HTTP %{http_code}" -X POST https://mcp.csr-llc.tech/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"health-check","version":"1.0"}},"id":1}'
# Expect: 200
```

### 8f. Canary verification (15-minute wait)

After resume, wait 15 minutes and verify:

| Canary | Cadence | Expected |
|--------|---------|----------|
| GDA.cron.change-detector (Zb2quk78c5mszZ2C) | 5 min | ≥ 3 successful runs post-resume |
| GDA.cron.system-watchdog (LPUSYd4Vpph1Qg7n) | 10 min | ≥ 1 successful run post-cutover (it was never paused) |

---

## 9. Halt Conditions

| # | Condition | Phase | Action |
|---|-----------|-------|--------|
| 1 | Precondition check fails (Section 1) | Pre-exec | HALT — do not proceed |
| 2 | Connectivity pre-flight fails | Pre-exec | HALT — fix network/DNS before proceeding |
| 3 | Any auth/grant failure on gda-postgres | Pre-exec | HALT — add grants before proceeding |
| 4 | Backup script returns non-zero | Phase B | HALT — no rollback target |
| 5 | system-watchdog fails after credential edit | Phase D | HALT — revert credential immediately |
| 6 | Backend build fails | Phase E | HALT — revert to old image (Section 5e) |
| 7 | Backend health check fails within 60s | Phase E | HALT — revert to old image |
| 8 | schema_migrations count != 88 after restart | Phase E | HALT — migration runner corrupted state |
| 9 | Any writer workflow fails first post-resume run with DB error | Phase G | HALT — revert credential |
| 10 | Writes observed in n8n-envision-postgres-1 ADOPT tables post-cutover | Phase G | HALT — credential not properly applied |
| 11 | Active workflow count != 157 after resume | Phase F | HALT — workflows didn't resume |
| 12 | Any endpoint returns non-200 | Phase G | HALT — investigate before declaring complete |
| 13 | Canary workflows don't fire within 15 min | Phase G | HALT — scheduling broken |

---

## 10. Rollback

### 10a. Credential revert (primary rollback)

If the credential repoint is wrong or causes errors:

```
Edit HwronxMmGY5XDGEt in n8n UI:
  host: gda-postgres → n8n-envision-postgres-1
  database: gda_command → n8n
  user: gda → n8n
  password: <gda password> → <n8n password>
```

This instantly reverts all 122 workflows to the old DB. Takes ~30 seconds via UI.

### 10b. Backend revert

If the rebuilt backend fails:

```bash
# Stop the new container
docker stop gda-backend && docker rm gda-backend

# The old image is still cached:
# sha256:1b8ca37f1e5651184c0f22e031e79d50d2d8710152750eef773756e6c86dcdbf

# Re-run with old image using compose (check out pre-PR#288 code):
cd /root/gda-command-v2
git stash  # or git checkout <old-commit>
docker compose -f docker-compose.prod.yml up -d backend
```

### 10c. Data restore

If data drift is detected (writes went to wrong place, data corruption):

```bash
# Restore gda_command from the Phase B backup (selective, 28 ADOPT tables only)
pg_restore --host=localhost --port=5432 --username=gda --dbname=gda_command \
  --table=gda_risk_register --table=gda_opportunity_tracker \
  ... (all 28 tables) \
  --clean --if-exists --no-owner \
  /root/backups/gda_command_<timestamp>.dump
```

> **WARNING:** Do NOT use `--clean` against the full DB. Selective per-table restore only.
> The 86 production application tables must NEVER be touched by rollback.

### 10d. Recovery matrix

| Failure | Recoverable in-place? | Human intervention needed? |
|---------|----------------------|---------------------------|
| Credential wrong (auth error) | Yes — re-edit credential | No |
| Credential right but data goes to wrong DB | Yes — re-edit credential | Check for split writes |
| Backend build fails | Yes — use cached old image | No |
| Backend starts but migrations re-apply | Investigate — may be fine | Maybe — check what ran |
| Data corruption on ADOPT tables | Yes — restore from backup | Review what caused it |
| n8n container crash | Restart n8n container | No |
| Both credential and backend fail | Revert both independently | Architect should review |

---

## 11. Deliberate Non-Goals

1. **Step 4 does NOT drop tables from n8n-envision-postgres-1.** That's Step 5. The shadow
   tables remain as a fallback until Step 5 explicitly removes them.

2. **Step 4 does NOT modify any workflow JSON.** Only the credential pointer changes. No
   workflow node configurations, trigger settings, or execution logic is altered.

3. **Step 4 does NOT touch yK1VVsSN3tn0baVm** ("Postgres account") or any other non-GDA
   credential. That credential has 0 workflow references and is completely out of scope.

4. **Step 4 does NOT modify the n8n `n8n` database.** The credential edit is stored in
   n8n's `credentials_entity` table on n8n-envision-postgres-1, which is an n8n-internal
   table — but this is a normal n8n operation (updating a credential), not a direct DB
   modification.

5. **Step 4 does NOT include Compose drift reconciliation** (F-037). The backend restart
   uses the existing compose file as-is.

---

## 12. Open Questions

### 12a. Credential edit method

The plan recommends editing HwronxMmGY5XDGEt via the n8n UI. However, if the architect
prefers a scripted approach (for reproducibility and audit trail), we would need:
- The n8n encryption key (to encrypt the new credential data)
- The exact JSON structure of the credential payload
- A script that calls the n8n internal API endpoint for credential updates

**Question for architect:** UI edit (simpler, one-time) or scripted (reproducible, auditable)?

### 12b. gda user password

The credential repoint requires the `gda` user's PostgreSQL password. This is set in the
docker-compose environment (`POSTGRES_PASSWORD`). The execution script or UI operator needs
access to this value.

**Question for architect:** Is the gda password available in a known location (compose env,
.env file), or does it need to be provided at execution time?

### 12c. Writes to non-ADOPT tables via HwronxMmGY5XDGEt

Some of the 122 workflows may write to tables in the original 86 gda_command table set
(e.g., `enrichment_log`, `audit_log`). Currently, these workflows write to these tables on
**n8n-envision-postgres-1/n8n** — but after the cutover, they'll write to
**gda-postgres/gda_command** where these tables are the production originals.

This is actually the **correct behavior** — we WANT these writes to go to gda_command. But
it's worth confirming: are there any tables that exist on n8n-envision-postgres-1/n8n but
do NOT exist on gda-postgres/gda_command? If a workflow writes to a table that doesn't exist
on gda_command, that workflow will fail after the cutover.

**Mitigation:** Before execution, compare the list of tables that exist on both DBs. Any
table referenced by the 122 workflows that doesn't exist on gda_command is a halt condition.

### 12d. system-watchdog as live canary

The plan keeps system-watchdog running during the cutover as a live canary. If the credential
repoint breaks DB connectivity, the watchdog will fail within its next 10-minute cycle,
providing early warning BEFORE we resume the 17 writers.

**Question for architect:** Is this acceptable risk? The alternative is to also pause the
watchdog (losing the early warning signal) and only discover credential issues when we
resume all 17 at once.

### 12e. Backend rebuild scope

The `docker compose build backend` command will rebuild from the current repo state on the
VPS (`/root/gda-command-v2`). This needs to be on the latest `main` (post-PR#297). Verify
with `git log --oneline -1` before building.

**No ambiguity expected** — just a confirmation step during execution.
