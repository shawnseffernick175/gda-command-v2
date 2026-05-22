# F-022 Category E — UTILITY Manual/Webhook-Only Assessment

**Date:** 2026-05-21 (executed ~17:10 UTC)
**Author:** Devin (automated audit)
**Status:** Read-only inventory — no deletions, no toggles, no edits

---

## Summary

| Metric | Value |
|--------|-------|
| Total active workflows | 171 |
| Cat E candidates (manual/webhook-only, not called by other workflows) | 51 |
| KEEP | 35 |
| DELETE | 3 |
| INVESTIGATE | 13 |
| PRESERVE | 0 |

**No Bridge PAT or canary workflow references found in any Cat E workflow.**

---

## Methodology

1. Queried n8n API for all 171 active workflows
2. Filtered to workflows where **every trigger** is Manual Trigger or Webhook (no Schedule/Cron, no Chat, no Execute Workflow Trigger) → **122 candidates**
3. Excluded sub-workflows called by other workflows:
   - 1 workflow referenced by Execute Workflow node ID (`GDA.error.handler`)
   - 77 workflows whose webhook paths appear in other workflow HTTP Request nodes
   - **71 total excluded** → **51 final Cat E candidates**
4. Cross-referenced each against:
   - Backend `webhook-registry.ts` (8 matched — production API endpoints)
   - Backend source code (3 additional matches via route files / mock data)
   - Frontend source (0 direct webhook path references — frontend uses backend proxy)
5. All 51 candidates have **0 recorded executions** (expected: `saveDataSuccessExecution=all` was flipped only ~24h ago on 2026-05-21, and these are on-demand endpoints)

### Key Architectural Note

The backend has a **generic n8n webhook proxy** at `POST /api/n8n/:webhook` (see `packages/backend/src/routes/n8n-proxy.ts`). This means any n8n webhook can be called from the frontend without being explicitly listed in the webhook registry. The registry is a subset of what's actually callable.

---

## Credential Cross-Reference

### GDA Postgres (HwronxMmGY5XDGEt) — 31 of 51 Cat E workflows

| ID | Name |
|----|------|
| MrL0WRTornU9WdME | GDA.api.semantic-search |
| alHJibzND41T6p93 | GDA.oneshot.embed-capture-plans |
| vZE5yJhvMvhQUsXx | GDA.api.intelligence-dashboard |
| lUYEZeUk8lAvGDVg | GDA.api.export-excel |
| 4szS4FHP1pW1PiG8 | GDA.enrichment.capture-plan-cards |
| rWVp9Hp1ZthoqpfA | GDA.api.naics 2 |
| 43YhEBU38pKBrqcv | GDA.api.target-agencies 2 |
| 9qrsria0fy719T98 | GDA.api.bd-activity-log |
| 9orS3FVOlInMes9r | GDA.api.saved-opps |
| kW8RLL4hbAuGV6qr | GDA.api.save-opp |
| EeR3nC8l30Vdsu5b | GDA.api.ai-feedback |
| FMYsT157mKuqn06v | GDA.api.discussions |
| GH6XlzfhdVixIKFJ | GDA.api.error-log |
| qyOybkM9DIHWoLKy | GDA.api.scan-history |
| W8DukE5eD6GPgopq | GDA.api.govtribe-cache |
| w3URDObLimmiHuUB | GDA.api.capture-intel-modules |
| PqJgzJkHM1BFWkwl | GDA.api.e2e-reports |
| BQFYbILTezLgqkDY | GDA.cron.broad-opp-search |
| jC1lR5zpO7IaZqKa | GDA.cron.forecast-ingest |
| WXpKiNp8AXCt56bU | GDA.api.competitor-field |
| AuwOV685PipTOXWJ | GDA.api.contacts |
| kZT3jlZn4lKfuhwh | GDA.api.capture-hub |
| iJaZmAsI4GVvMySQ | GDA.form.quick-entry |
| P8AfP8P84xi33auD | GDA.api.aop-tracker |
| AZLL3i2lyMEsARaK | GDA.api.clause-library |
| upEGGfu6dYIwr0tD | GDA.api.daily-brief-reader |
| yMo7WrELV8JVOi2M | GDA.intel.an1-incumbent-win-themes |
| l6X3n5paaIqMKWxB | GDA.api.fast-track-needs |
| FQUE8nUF4parKjPs | GDA.api.opportunity-detail |
| 1aYt8mIzZ5duB3TX | GDA.api.approvals-queue |
| Ak4Kb3gRjrZZjEDl | GDA.doctrine.pr-merge-draft |

### Active Bridge PATs (Bridge_2 / Bridge_3 / TBzQR4MBiWOGoJmV) — 0 references

No Cat E workflow references any Bridge PAT.

### Canary Workflows (LPUSYd4Vpph1Qg7n / Zb2quk78c5mszZ2C) — 0 references

No Cat E workflow references either canary.

---

## Full Classification Table

### KEEP (35 workflows)

Legit on-demand tools: backend-wired API endpoints, QA tooling, deployment automation, infrastructure services.

| ID | Name | Webhook Path(s) | Created | Nodes | Creds | GDA PG | Justification |
|----|------|-----------------|---------|-------|-------|--------|---------------|
| MrL0WRTornU9WdME | GDA.api.semantic-search | gda-semantic-search | 2026-04-07 | 6 | 2 | ✓ | Backend webhook-registry wired |
| RqtftSynjqEKbs9Q | GDA.api.report-builder | gda-report-builder | 2026-03-11 | 13 | 4 | — | Backend webhook-registry wired |
| kW8RLL4hbAuGV6qr | GDA.api.save-opp | gda-save-opp | 2026-03-08 | 5 | 2 | ✓ | Backend webhook-registry wired |
| FMYsT157mKuqn06v | GDA.api.discussions | gda-discussions | 2026-03-08 | 5 | 2 | ✓ | Backend webhook-registry wired |
| WXpKiNp8AXCt56bU | GDA.api.competitor-field | gda-competitor-field | 2026-03-23 | 4 | 2 | ✓ | Backend webhook-registry wired |
| AuwOV685PipTOXWJ | GDA.api.contacts | gda-contacts | 2026-03-23 | 7 | 2 | ✓ | Backend webhook-registry wired |
| FQUE8nUF4parKjPs | GDA.api.opportunity-detail | gda-opportunity-detail | 2026-05-05 | 14 | 2 | ✓ | Backend webhook-registry wired |
| BQFYbILTezLgqkDY | GDA.cron.broad-opp-search | broad-opp-search | 2026-03-23 | 9 | 2 | ✓ | Referenced in backend anomaly-mock.ts |
| l6X3n5paaIqMKWxB | GDA.api.fast-track-needs | gda-fast-track | 2026-05-04 | 14 | 2 | ✓ | Referenced in backend fast-track.ts route |
| 1aYt8mIzZ5duB3TX | GDA.api.approvals-queue | approvals-queue | 2026-05-08 | 15 | 1 | ✓ | Referenced in backend enrichments-mock.ts |
| lUYEZeUk8lAvGDVg | GDA.api.export-excel | gda-excel-export | 2026-03-04 | 8 | 2 | ✓ | Substantive (8 nodes), uses GDA PG |
| 4szS4FHP1pW1PiG8 | GDA.enrichment.capture-plan-cards | gda-enrich-capture-plans | 2026-04-10 | 11 | 2 | ✓ | Substantive (11 nodes), uses GDA PG |
| rWVp9Hp1ZthoqpfA | GDA.api.naics 2 | gda-naics | 2026-03-15 | 13 | 2 | ✓ | Substantive (13 nodes), uses GDA PG |
| 9qrsria0fy719T98 | GDA.api.bd-activity-log | gda-bd-activity | 2026-04-12 | 12 | 2 | ✓ | Substantive (12 nodes), uses GDA PG |
| 9orS3FVOlInMes9r | GDA.api.saved-opps | gda-saved-opps | 2026-03-08 | 5 | 2 | ✓ | Substantive (5 nodes), uses GDA PG |
| EeR3nC8l30Vdsu5b | GDA.api.ai-feedback | gda-ai-feedback | 2026-03-08 | 5 | 2 | ✓ | Substantive (5 nodes), uses GDA PG |
| GH6XlzfhdVixIKFJ | GDA.api.error-log | gda-error-log | 2026-04-07 | 6 | 2 | ✓ | Substantive (6 nodes), uses GDA PG |
| W8DukE5eD6GPgopq | GDA.api.govtribe-cache | gda-govtribe-cache | 2026-03-21 | 7 | 2 | ✓ | Substantive (7 nodes), uses GDA PG |
| w3URDObLimmiHuUB | GDA.api.capture-intel-modules | gda-capture-modules | 2026-03-21 | 18 | 2 | ✓ | Substantive (18 nodes), uses GDA PG |
| kZT3jlZn4lKfuhwh | GDA.api.capture-hub | gda-capture-hub | 2026-03-24 | 7 | 2 | ✓ | Substantive (7 nodes), uses GDA PG |
| iJaZmAsI4GVvMySQ | GDA.form.quick-entry | gda-quick-entry | 2026-04-07 | 8 | 2 | ✓ | Substantive (8 nodes), uses GDA PG |
| P8AfP8P84xi33auD | GDA.api.aop-tracker | gda-aop-tracker | 2026-03-25 | 7 | 2 | ✓ | Substantive (7 nodes), uses GDA PG |
| AZLL3i2lyMEsARaK | GDA.api.clause-library | gda-clause-library | 2026-04-05 | 11 | 2 | ✓ | Substantive (11 nodes), uses GDA PG |
| upEGGfu6dYIwr0tD | GDA.api.daily-brief-reader | gda-daily-brief-read | 2026-04-06 | 7 | 2 | ✓ | Substantive (7 nodes), uses GDA PG |
| ER9YVGsU6mnCXDr1 | GDA.auto.e2e-test | gda-e2e-test | 2026-03-20 | 3 | 1 | — | QA/testing utility |
| PqJgzJkHM1BFWkwl | GDA.api.e2e-reports | gda-e2e-reports | 2026-03-22 | 8 | 2 | ✓ | QA/testing utility |
| aAVitXXjGWaP7bb2 | GDA.qa.fix-runner | gda-qa-fix | 2026-04-26 | 3 | 1 | — | QA tooling |
| H6YKZDmLusvQqfIn | GDA.qa.computer-operator | (uuid path) | 2026-04-26 | 2 | 0 | — | QA tooling |
| PhrS9kOy6fV1wKkj | GDA.qa.latest-failures | gda-qa-latest-failures | 2026-05-07 | 3 | 1 | — | QA tooling |
| akvlbmdUBCgx58PC | GDA.controlled-fix-agent | gda-controlled-fix-agent | 2026-04-26 | 3 | 0 | — | Agent-driven fix runner |
| 8r0ss5z6X3i0yuqi | GDA.mcp.proxy | gda-mcp-proxy | 2026-04-06 | 8 | 2 | — | MCP proxy relay, infrastructure |
| 24mQWu8YXUVDiCNV | GDA.deploy.frontend | gda-deploy-frontend | 2026-05-07 | 6 | 2 | — | Deployment automation (Cat B: VPS deploy script caller) |
| MqRUg1UglZqjAym1 | GDA GitHub Bridge — Production | gda-github-bridge | 2026-05-06 | 8 | 1 | — | GitHub integration bridge |
| Ak4Kb3gRjrZZjEDl | GDA.doctrine.pr-merge-draft | gda-doctrine-pr-merge | 2026-05-09 | 9 | 2 | ✓ | Doctrine automation, uses GDA PG |
| 4bhVvKvVgLXcX6AZ | GDA.ops.gist-session-update | gda-gist-session-update | 2026-05-03 | 4 | 2 | — | Ops utility for session tracking |

### DELETE (3 workflows)

Forgotten one-shots or superseded integrations. Zero executions, disposable by name/status.

| ID | Name | Webhook Path | Created | Nodes | Creds | GDA PG | Justification |
|----|------|-------------|---------|-------|-------|--------|---------------|
| alHJibzND41T6p93 | GDA.oneshot.embed-capture-plans | gda-embed-cp | 2026-04-07 | 5 | 2 | ✓ | `oneshot` prefix, 0 execs, one-time embedding task |
| V665zkbwqxWuvAFJ | GDA.oneshot.write-jsx-s202 | gda-write-jsx-s202 | 2026-05-04 | 3 | 2 | — | `oneshot` prefix, sprint-specific (s202), 0 execs |
| nV36K8LgL31nY37b | GDA.ingest.govtribe-zapier | govtribe-ingest | 2026-05-20 | 3 | 1 | — | Superseded by direct-poll (PR #237); old Zapier relay |

### INVESTIGATE (13 workflows)

Unclear purpose — no backend code reference, 0 executions, needs architect input.

| ID | Name | Webhook Path | Created | Nodes | Creds | GDA PG | Concern |
|----|------|-------------|---------|-------|-------|--------|---------|
| dKibEwHO773kehFg | GDA.api.doc-compare | gda-doc-compare | 2026-03-16 | 16 | 3 | — | No code ref, but substantive (16 nodes) — planned feature? |
| 8UPZHbcTwJstPKAS | GDA.api.doc-ingest | gda-doc-ingest | 2026-02-28 | 17 | 3 | — | No code ref, but substantive (17 nodes) — planned feature? |
| vZE5yJhvMvhQUsXx | GDA.api.intelligence-dashboard | gda-intel-dashboard | 2026-04-07 | 4 | 2 | ✓ | Small (4 nodes), no code ref, uses GDA PG |
| 43YhEBU38pKBrqcv | GDA.api.target-agencies 2 | gda-target-agencies | 2026-03-15 | 4 | 2 | ✓ | Small (4 nodes), no code ref, uses GDA PG |
| o1XU0vwmF1zBSG4S | GDA.api.landing-brief | gda-landing-brief | 2026-03-06 | 6 | 2 | — | No code ref, 0 execs |
| qyOybkM9DIHWoLKy | GDA.api.scan-history | gda-scan-history | 2026-03-20 | 4 | 2 | ✓ | Small (4 nodes), no code ref, uses GDA PG |
| jC1lR5zpO7IaZqKa | GDA.cron.forecast-ingest | gda-forecast-ingest | 2026-03-23 | 7 | 2 | ✓ | Named `cron` but webhook-only trigger, 0 execs |
| 1NQhq7rU89m23Zop | GDA.api.chart-generator | gda-chart | 2026-03-26 | 4 | 1 | — | No code ref, no GDA PG, 0 execs |
| MSwEgLTafx9ASXyJ | GDA.batch.bulk-data-ingest | gda-bulk-ingest | 2026-04-03 | 6 | 1 | — | Batch ingest tool, 0 execs — planned or abandoned? |
| MP4p5WX1GRhWNFyv | GDA.api.smart-recommender | gda-recommend | 2026-04-03 | 10 | 1 | — | Substantive (10 nodes), no code ref |
| nLWF3YyCQEnNWo6K | GDA.api.priority-score-engine | gda-score-v21 | 2026-04-03 | 8 | 1 | — | No code ref, 0 execs |
| 6iVNBdDAmzxX2Hc1 | GDA.auto.stage-audit-logger | gda-stage-audit | 2026-04-03 | 4 | 1 | — | No code ref, 0 execs |
| yMo7WrELV8JVOi2M | GDA.intel.an1-incumbent-win-themes | gda-an1-run | 2026-05-03 | 9 | 3 | ✓ | Manual + webhook triggers, intel analysis — planned? |

---

## Recommended Next Actions

### DELETE bucket (3 workflows)
- Pair with any other cleanup deletions in a future session
- Pre-check: confirm still active=true and 0 executions before deleting
- `GDA.ingest.govtribe-zapier` path (`govtribe-ingest`) is in the backend webhook-registry — remove registry entry in same PR

### INVESTIGATE bucket (13 workflows)
- **Architect decision needed:** For each, determine if it's a planned feature (keep) or abandoned scaffolding (delete)
- Highest-priority items:
  - `GDA.api.doc-compare` (16 nodes) and `GDA.api.doc-ingest` (17 nodes) — most complex, worth understanding intent
  - `GDA.cron.forecast-ingest` — named `cron` but has no schedule trigger, possible misconfiguration
  - `GDA.intel.an1-incumbent-win-themes` — most recent (May 3), has both manual and webhook triggers

### KEEP bucket (35 workflows)
- No action needed. These are production API endpoints, QA tooling, or deployment infrastructure.
- 24 of 35 use GDA Postgres credential — healthy coverage for Step 2 canary monitoring.

---

## F-022 Lineage Summary

| Category | Scope | Result | Deletions |
|----------|-------|--------|-----------|
| **Cat A** (DEAD) | Active workflows with 0 execs, never modified | 2 found | 2 deleted (PR #274) |
| **Cat B** (ORPHAN/DORMANT) | Silent webhook/form workflows | 7 investigated: 2 WIRED, 3 ORPHAN, 1 EXTERNAL→ORPHAN, 1 inactive dupe | 4 deleted (PR #274) |
| **Cat C** (VERIFY) | Health of 169 active workflows post-saveDataSuccessExecution | 0 broken, 1 degraded (intel-feed 08:00 UTC), 10 healthy, 160 new | 0 (monitoring) |
| **Cat D** (STALE INACTIVE) | Inactive workflows | 8 found, all <30 days old | 8 deleted (PR #279) |
| **Cat E** (UTILITY) | Active manual/webhook-only workflows | 51 candidates: 35 KEEP, 3 DELETE, 13 INVESTIGATE, 0 PRESERVE | 0 (inventory only) |

**Total F-022 deletions to date: 14** (6 from Cat A+B via PR #274, 8 from Cat D via PR #279)

**Pending deletions: 3** (Cat E DELETE bucket, awaiting future session)

**Open items:**
- Cat C re-verification scheduled 2026-05-28 (Issue #275)
- Cat E INVESTIGATE bucket (13 workflows) needs architect review
- Cat E DELETE bucket (3 workflows) execution in future session
- Intel-feed task runner saturation at 08:00 UTC (separate stagger fix)
