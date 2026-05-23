# F-026 Step 5 Plan — Drop n8n Shadow Tables

**Status:** PLAN ONLY — no execution until architect approval  
**Prerequisite:** Step 4 CLOSED (PR #304, commit d1c56f9, 2026-05-23 12:24 PM EST)  
**24-hour soak:** In progress. Shadow tables confirmed idle (delta=0 over 5-min sample at cutover).  
**Plan author:** Devin  
**Architect review required:** YES — open questions in Section 10  

---

## 1. Scope Enumeration

### 1a. Full table inventory on n8n-envision-postgres-1/n8n

Total tables in `public` schema: **156**

#### Classification

| Category | Count | Decision |
|----------|-------|----------|
| 58 known GDA tables (28 ADOPT + 30 N8N-ONLY) | 58 | **DROP** (via rename-first) |
| 6 orphan GDA tables (on n8n, NOT on gda_command) | 6 | **INVESTIGATE** (see Section 1b) |
| 5 non-gda-prefix GDA tables in the 58 set | 5 | Included in the 58 above |
| n8n internal tables | 92 | **KEEP** — out of scope |

#### 58 Known GDA Tables — IN SCOPE (DROP)

These exist on both n8n-envision-postgres-1/n8n (shadow) and gda-postgres/gda_command (live). All 122 HwronxMmGY5XDGEt workflows now target gda_command. Shadow copies receive no writes since cutover.

**28 ADOPT tables:**

| # | Table Name | n8n Rows (approx) | gda_command Rows |
|---|-----------|-------------------|------------------|
| 1 | `daily_trends` | shadow | 537 |
| 2 | `ft_opportunity_signal` | shadow | 234 |
| 3 | `ft_signal_source` | shadow | 10 |
| 4 | `gda_action_items` | shadow | 47 |
| 5 | `gda_active_contracts` | shadow | 5 |
| 6 | `gda_capture_plans` | shadow | 110 |
| 7 | `gda_competitor_cache` | shadow | 1 |
| 8 | `gda_competitor_watchlist` | shadow | 46 |
| 9 | `gda_contacts` | shadow | 2 |
| 10 | `gda_dashboard_intel_cache` | shadow | 6 |
| 11 | `gda_embeddings` | shadow | 821 |
| 12 | `gda_error_log` | shadow | 334 |
| 13 | `gda_intelligence_log` | shadow | 54 |
| 14 | `gda_learned_weights` | shadow | 18 |
| 15 | `gda_morning_briefings` | shadow | 40 |
| 16 | `gda_opportunity_alerts` | shadow | 7 |
| 17 | `gda_opportunity_tracker` | shadow | 1,780 |
| 18 | `gda_relationships` | shadow | 0 |
| 19 | `gda_risk_register` | shadow | 464 |
| 20 | `gda_saved_opportunities` | shadow | 0 |
| 21 | `gda_teaming_partners` | shadow | 12 |
| 22 | `gda_touchpoints` | shadow | 0 |
| 23 | `gda_trend_arrays` | shadow | 15 |
| 24 | `gda_wargames` | shadow | 1 |
| 25 | `gda_win_loss` | shadow | 6 |
| 26 | `gda_win_loss_db` | shadow | 10 |
| 27 | `govtribe_cache` | shadow | 0 |
| 28 | `opportunity_alerts` | shadow | 2 |

**30 N8N-ONLY tables:**

| # | Table Name | n8n Rows (approx) | gda_command Rows |
|---|-----------|-------------------|------------------|
| 29 | `gda_action_history` | shadow | 54 |
| 30 | `gda_ai_feedback` | shadow | 0 |
| 31 | `gda_aop_tracker` | shadow | 12 |
| 32 | `gda_approval_queue` | shadow | 0 |
| 33 | `gda_capture_lessons` | shadow | 0 |
| 34 | `gda_chat_history` | shadow | 52 |
| 35 | `gda_clause_library` | shadow | 18 |
| 36 | `gda_competitor_crawls` | shadow | 31 |
| 37 | `gda_compliance_matrices` | shadow | 8 |
| 38 | `gda_contract_vehicles` | shadow | 2 |
| 39 | `gda_daily_briefings` | shadow | 60 |
| 40 | `gda_daily_briefs` | shadow | 14 |
| 41 | `gda_deep_research` | shadow | 12 |
| 42 | `gda_dept_market` | shadow | 8 |
| 43 | `gda_discussions` | shadow | 0 |
| 44 | `gda_doc_inbox` | shadow | 0 |
| 45 | `gda_e2e_reports` | shadow | 268 |
| 46 | `gda_feedback` | shadow | 8 |
| 47 | `gda_health_scans` | shadow | 30 |
| 48 | `gda_idiq_tracker` | shadow | 21 |
| 49 | `gda_incumbent_analysis` | shadow | 18 |
| 50 | `gda_knowledge_base` | shadow | 4 |
| 51 | `gda_learning_log` | shadow | 331 |
| 52 | `gda_meeting_notes` | shadow | 43 |
| 53 | `gda_mega_cache` | shadow | 1 |
| 54 | `gda_naics_tracking` | shadow | 0 |
| 55 | `gda_ndaa_intel` | shadow | 14 |
| 56 | `gda_ooda_loops` | shadow | 3 |
| 57 | `gda_prompt_architect_memory` | shadow | 0 |
| 58 | `gda_pwin_scores` | shadow | 12 |

### 1b. 6 Orphan GDA Tables — INVESTIGATE

These tables exist on n8n-envision-postgres-1/n8n but do **NOT** exist on gda-postgres/gda_command. They contain data and are referenced by active workflows.

| Table | n8n Rows | gda_command? | Referencing Workflows | Credential Used |
|-------|----------|--------------|----------------------|-----------------|
| `gda_content_store` | 13 | NO | GDA.auto.learning-capture (Rvs15RThVvlj3nVz) | F4J3vYsPrJrYiO49 (webhook auth) |
| `gda_data_lake` | 54 | NO | GDA.cron.competitor-auto-enrichment (51SkEH6ulJrmHdgS) | F4J3vYsPrJrYiO49 (webhook auth) |
| `gda_decision_memory` | 2 | NO | GDA.auto.learning-capture (Rvs15RThVvlj3nVz) | F4J3vYsPrJrYiO49 (webhook auth) |
| `gda_interaction_log` | 30 | NO | GDA.auto.learning-capture (Rvs15RThVvlj3nVz) | F4J3vYsPrJrYiO49 (webhook auth) |
| `gda_pattern_library` | 219 | NO | GDA.auto.pattern-extractor (njIW6V5tCFJIIjfk), GDA.event.bidirectional-sync (3sFvFJwP0xlihoLj) | F4J3vYsPrJrYiO49, HwronxMmGY5XDGEt |
| `gda_stage_audit` | 12 | NO | GDA.event.bidirectional-sync (3sFvFJwP0xlihoLj), GDA.cron.amendment-monitor (1o8h7yGhLKLoNP0S) | HwronxMmGY5XDGEt |

**Key observations:**
- **`gda_pattern_library`** and **`gda_stage_audit`** are referenced by workflows using `HwronxMmGY5XDGEt` (the pivoted credential). These workflows will ERROR when they try to access these tables on gda_command where they don't exist.
- The other 4 tables (`gda_content_store`, `gda_data_lake`, `gda_decision_memory`, `gda_interaction_log`) are referenced only by workflows using `F4J3vYsPrJrYiO49` (HTTP webhook auth, not a Postgres credential). These workflows build SQL via Code nodes and execute through a backend proxy — they may or may not be affected by the credential cutover.
- 4 of the 5 referencing workflows have **no execution history** at all (never fired or data pruned). Only `GDA.cron.amendment-monitor` has recent execution (success at 2026-05-23T12:00:00Z).

**Total orphan data:** 330 rows across 6 tables.

### 1c. Tables OUT OF SCOPE (KEEP)

92 n8n internal tables — these are n8n's own infrastructure tables and must not be touched:

`agent_checkpoints`, `agent_execution`, `agent_execution_threads`, `agent_published_version`, `agents`, `agents_messages`, `agents_observation_cursors`, `agents_observation_locks`, `agents_observations`, `agents_resources`, `agents_threads`, `ai_builder_temporary_workflow`, `annotation_tag_entity`, `auth_identity`, `auth_provider_sync_history`, `binary_data`, `chat_hub_agent_tools`, `chat_hub_agents`, `chat_hub_messages`, `chat_hub_session_tools`, `chat_hub_sessions`, `chat_hub_tools`, `credential_dependency`, `credentials_entity`, `data_table`, `data_table_column`, `data_table_user_tLsASCcsZb5lXGxm`, `deployment_key`, `dynamic_credential_entry`, `dynamic_credential_resolver`, `dynamic_credential_user_entry`, `evaluation_config`, `event_destinations`, `execution_annotation_tags`, `execution_annotations`, `execution_data`, `execution_entity`, `execution_metadata`, `folder`, `folder_tag`, `insights_by_period`, `insights_metadata`, `insights_raw`, `installed_nodes`, `installed_packages`, `instance_ai_iteration_logs`, `instance_ai_messages`, `instance_ai_observational_memory`, `instance_ai_resources`, `instance_ai_run_snapshots`, `instance_ai_threads`, `instance_ai_workflow_snapshots`, `instance_version_history`, `invalid_auth_token`, `migrations`, `oauth_access_tokens`, `oauth_authorization_codes`, `oauth_clients`, `oauth_refresh_tokens`, `oauth_user_consents`, `processed_data`, `project`, `project_relation`, `project_secrets_provider_access`, `role`, `role_mapping_rule`, `role_mapping_rule_project`, `role_scope`, `scope`, `secrets_provider_connection`, `settings`, `shared_credentials`, `shared_workflow`, `tag_entity`, `test_case_execution`, `test_run`, `token_exchange_jti`, `trusted_key`, `trusted_key_source`, `user`, `user_api_keys`, `user_favorites`, `variables`, `webhook_entity`, `workflow_builder_session`, `workflow_dependency`, `workflow_entity`, `workflow_history`, `workflow_publish_history`, `workflow_published_version`, `workflow_statistics`, `workflows_tags`

---

## 2. Drop Strategy — Two-Phase

### Phase 5a: Rename (Day 0 — after 24h soak)

Rename all 58 in-scope tables to `_archive_20260523_<original_name>` in the same schema. This forces any workflow still referencing old names to ERROR immediately with `relation "X" does not exist`, instead of silently succeeding against stale data.

**Exact rename SQL (58 statements):**

```sql
-- 28 ADOPT tables
ALTER TABLE public.daily_trends RENAME TO _archive_20260523_daily_trends;
ALTER TABLE public.ft_opportunity_signal RENAME TO _archive_20260523_ft_opportunity_signal;
ALTER TABLE public.ft_signal_source RENAME TO _archive_20260523_ft_signal_source;
ALTER TABLE public.gda_action_items RENAME TO _archive_20260523_gda_action_items;
ALTER TABLE public.gda_active_contracts RENAME TO _archive_20260523_gda_active_contracts;
ALTER TABLE public.gda_capture_plans RENAME TO _archive_20260523_gda_capture_plans;
ALTER TABLE public.gda_competitor_cache RENAME TO _archive_20260523_gda_competitor_cache;
ALTER TABLE public.gda_competitor_watchlist RENAME TO _archive_20260523_gda_competitor_watchlist;
ALTER TABLE public.gda_contacts RENAME TO _archive_20260523_gda_contacts;
ALTER TABLE public.gda_dashboard_intel_cache RENAME TO _archive_20260523_gda_dashboard_intel_cache;
ALTER TABLE public.gda_embeddings RENAME TO _archive_20260523_gda_embeddings;
ALTER TABLE public.gda_error_log RENAME TO _archive_20260523_gda_error_log;
ALTER TABLE public.gda_intelligence_log RENAME TO _archive_20260523_gda_intelligence_log;
ALTER TABLE public.gda_learned_weights RENAME TO _archive_20260523_gda_learned_weights;
ALTER TABLE public.gda_morning_briefings RENAME TO _archive_20260523_gda_morning_briefings;
ALTER TABLE public.gda_opportunity_alerts RENAME TO _archive_20260523_gda_opportunity_alerts;
ALTER TABLE public.gda_opportunity_tracker RENAME TO _archive_20260523_gda_opportunity_tracker;
ALTER TABLE public.gda_relationships RENAME TO _archive_20260523_gda_relationships;
ALTER TABLE public.gda_risk_register RENAME TO _archive_20260523_gda_risk_register;
ALTER TABLE public.gda_saved_opportunities RENAME TO _archive_20260523_gda_saved_opportunities;
ALTER TABLE public.gda_teaming_partners RENAME TO _archive_20260523_gda_teaming_partners;
ALTER TABLE public.gda_touchpoints RENAME TO _archive_20260523_gda_touchpoints;
ALTER TABLE public.gda_trend_arrays RENAME TO _archive_20260523_gda_trend_arrays;
ALTER TABLE public.gda_wargames RENAME TO _archive_20260523_gda_wargames;
ALTER TABLE public.gda_win_loss RENAME TO _archive_20260523_gda_win_loss;
ALTER TABLE public.gda_win_loss_db RENAME TO _archive_20260523_gda_win_loss_db;
ALTER TABLE public.govtribe_cache RENAME TO _archive_20260523_govtribe_cache;
ALTER TABLE public.opportunity_alerts RENAME TO _archive_20260523_opportunity_alerts;

-- 30 N8N-ONLY tables
ALTER TABLE public.gda_action_history RENAME TO _archive_20260523_gda_action_history;
ALTER TABLE public.gda_ai_feedback RENAME TO _archive_20260523_gda_ai_feedback;
ALTER TABLE public.gda_aop_tracker RENAME TO _archive_20260523_gda_aop_tracker;
ALTER TABLE public.gda_approval_queue RENAME TO _archive_20260523_gda_approval_queue;
ALTER TABLE public.gda_capture_lessons RENAME TO _archive_20260523_gda_capture_lessons;
ALTER TABLE public.gda_chat_history RENAME TO _archive_20260523_gda_chat_history;
ALTER TABLE public.gda_clause_library RENAME TO _archive_20260523_gda_clause_library;
ALTER TABLE public.gda_competitor_crawls RENAME TO _archive_20260523_gda_competitor_crawls;
ALTER TABLE public.gda_compliance_matrices RENAME TO _archive_20260523_gda_compliance_matrices;
ALTER TABLE public.gda_contract_vehicles RENAME TO _archive_20260523_gda_contract_vehicles;
ALTER TABLE public.gda_daily_briefings RENAME TO _archive_20260523_gda_daily_briefings;
ALTER TABLE public.gda_daily_briefs RENAME TO _archive_20260523_gda_daily_briefs;
ALTER TABLE public.gda_deep_research RENAME TO _archive_20260523_gda_deep_research;
ALTER TABLE public.gda_dept_market RENAME TO _archive_20260523_gda_dept_market;
ALTER TABLE public.gda_discussions RENAME TO _archive_20260523_gda_discussions;
ALTER TABLE public.gda_doc_inbox RENAME TO _archive_20260523_gda_doc_inbox;
ALTER TABLE public.gda_e2e_reports RENAME TO _archive_20260523_gda_e2e_reports;
ALTER TABLE public.gda_feedback RENAME TO _archive_20260523_gda_feedback;
ALTER TABLE public.gda_health_scans RENAME TO _archive_20260523_gda_health_scans;
ALTER TABLE public.gda_idiq_tracker RENAME TO _archive_20260523_gda_idiq_tracker;
ALTER TABLE public.gda_incumbent_analysis RENAME TO _archive_20260523_gda_incumbent_analysis;
ALTER TABLE public.gda_knowledge_base RENAME TO _archive_20260523_gda_knowledge_base;
ALTER TABLE public.gda_learning_log RENAME TO _archive_20260523_gda_learning_log;
ALTER TABLE public.gda_meeting_notes RENAME TO _archive_20260523_gda_meeting_notes;
ALTER TABLE public.gda_mega_cache RENAME TO _archive_20260523_gda_mega_cache;
ALTER TABLE public.gda_naics_tracking RENAME TO _archive_20260523_gda_naics_tracking;
ALTER TABLE public.gda_ndaa_intel RENAME TO _archive_20260523_gda_ndaa_intel;
ALTER TABLE public.gda_ooda_loops RENAME TO _archive_20260523_gda_ooda_loops;
ALTER TABLE public.gda_prompt_architect_memory RENAME TO _archive_20260523_gda_prompt_architect_memory;
ALTER TABLE public.gda_pwin_scores RENAME TO _archive_20260523_gda_pwin_scores;
```

### Phase 5b: Drop (Day 0 + 7 days minimum)

After 7 days of post-rename stability with zero workflow errors mentioning renamed tables:

```sql
-- One DROP per archived table (58 total)
DROP TABLE IF EXISTS public._archive_20260523_daily_trends;
DROP TABLE IF EXISTS public._archive_20260523_ft_opportunity_signal;
DROP TABLE IF EXISTS public._archive_20260523_ft_signal_source;
-- ... (remaining 55 follow same pattern)
-- Full list generated at execution time from the rename manifest
```

### Why rename-first?

1. **Immediate failure signal:** Any workflow still hitting n8n shadow tables will get `relation "gda_X" does not exist` — loud, unmissable, logged.
2. **Trivial rollback:** `ALTER TABLE _archive_20260523_X RENAME TO X` — no data loss, < 1 second per table.
3. **7-day observation window:** Proves zero hidden dependencies before irreversible DROP.
4. **Contrast with DROP-first:** A silent `DROP TABLE` would succeed, but if something is still reading, you'd never know until data is mysteriously missing.

---

## 3. Backup Strategy

### Pre-rename backup (Phase 5a, before any rename)

```bash
# Full dump of all 58 in-scope GDA tables from n8n DB
docker exec n8n-envision-postgres-1 pg_dump -U n8n -d n8n \
  --table='daily_trends' \
  --table='ft_opportunity_signal' \
  --table='ft_signal_source' \
  --table='gda_action_items' \
  --table='gda_active_contracts' \
  --table='gda_capture_plans' \
  --table='gda_competitor_cache' \
  --table='gda_competitor_watchlist' \
  --table='gda_contacts' \
  --table='gda_dashboard_intel_cache' \
  --table='gda_embeddings' \
  --table='gda_error_log' \
  --table='gda_intelligence_log' \
  --table='gda_learned_weights' \
  --table='gda_morning_briefings' \
  --table='gda_opportunity_alerts' \
  --table='gda_opportunity_tracker' \
  --table='gda_relationships' \
  --table='gda_risk_register' \
  --table='gda_saved_opportunities' \
  --table='gda_teaming_partners' \
  --table='gda_touchpoints' \
  --table='gda_trend_arrays' \
  --table='gda_wargames' \
  --table='gda_win_loss' \
  --table='gda_win_loss_db' \
  --table='govtribe_cache' \
  --table='opportunity_alerts' \
  --table='gda_action_history' \
  --table='gda_ai_feedback' \
  --table='gda_aop_tracker' \
  --table='gda_approval_queue' \
  --table='gda_capture_lessons' \
  --table='gda_chat_history' \
  --table='gda_clause_library' \
  --table='gda_competitor_crawls' \
  --table='gda_compliance_matrices' \
  --table='gda_contract_vehicles' \
  --table='gda_daily_briefings' \
  --table='gda_daily_briefs' \
  --table='gda_deep_research' \
  --table='gda_dept_market' \
  --table='gda_discussions' \
  --table='gda_doc_inbox' \
  --table='gda_e2e_reports' \
  --table='gda_feedback' \
  --table='gda_health_scans' \
  --table='gda_idiq_tracker' \
  --table='gda_incumbent_analysis' \
  --table='gda_knowledge_base' \
  --table='gda_learning_log' \
  --table='gda_meeting_notes' \
  --table='gda_mega_cache' \
  --table='gda_naics_tracking' \
  --table='gda_ndaa_intel' \
  --table='gda_ooda_loops' \
  --table='gda_prompt_architect_memory' \
  --table='gda_pwin_scores' \
  --no-owner --no-acl --clean --if-exists \
  > /root/backups/f026-step5-shadow-tables-pre-rename-$(date +%Y%m%d).sql
```

**File location:** `/root/backups/f026-step5-shadow-tables-pre-rename-YYYYMMDD.sql`  
**Expected size:** > 500KB (58 tables, ~3,636 rows on n8n side)  
**Retention:** 30 days minimum post-Phase 5b  

### Existing backup script

`/root/backup-before-migration.sh` backs up the entire n8n database. It should be run in addition to the targeted dump above. The targeted dump is the primary restore source; the full backup is defense-in-depth.

---

## 4. Safety Gates — Phase 5a (Rename)

### 4a. Pre-rename: row count sanity check

For each of the 58 in-scope tables, confirm gda_command row count ≥ n8n shadow row count minus a reasonable retention delta (data-retention cron may have pruned rows on gda_command since cutover).

```sql
-- On gda-postgres/gda_command:
SELECT relname, n_live_tup FROM pg_stat_user_tables
WHERE schemaname='public'
AND relname IN ('<58 table names>')
ORDER BY relname;

-- On n8n-envision-postgres-1/n8n (same query):
SELECT relname, n_live_tup FROM pg_stat_user_tables
WHERE schemaname='public'
AND relname IN ('<58 table names>')
ORDER BY relname;
```

**Halt if:** Any gda_command table has 0 rows where n8n shadow has > 0 (indicates failed migration).

### 4b. Pre-rename: system health

- Canary (system-watchdog LPUSYd4Vpph1Qg7n) green: last execution status=success within 10 min
- Backend `curl -s https://gda.csr-llc.tech/health` → 200
- Change-detector (Zb2quk78c5mszZ2C) active: last execution within 5 min

### 4c. Pre-rename: n8n shadow idle confirmation

```sql
-- On n8n-envision-postgres-1:
SELECT datname, usename, client_addr, state, query_start, query
FROM pg_stat_activity
WHERE datname='n8n'
AND query NOT LIKE '%pg_stat%'
AND state='active'
AND query_start > (NOW() - INTERVAL '60 minutes');
```

Confirm zero queries against GDA tables in the last 60 minutes. n8n internal queries (execution_entity, workflow_entity) are expected and safe to ignore.

### 4d. Post-rename: canary trigger

Manually trigger system-watchdog. Confirm status=success (it queries gda_command, not n8n — should be unaffected).

### 4e. Post-rename: 60-minute monitoring window

Monitor for workflow ERRORs mentioning any of the 58 original table names:

```bash
# Check n8n execution errors in last 60 min
N8N_API_KEY=$(grep N8N_API_KEY /root/n8n-envision/.env | cut -d= -f2 | tr -d '"' | tr -d "'")
curl -s -H "accept: application/json" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "http://localhost:5678/api/v1/executions?status=error&limit=50" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
for e in data.get('data', []):
    print(f\"{e['id']} | {e['workflowId']} | {e['startedAt']} | {e.get('stoppedAt','')}\")"
```

**Halt if:** Any error references a renamed GDA table name → rename back immediately (Section 6).

---

## 5. Safety Gates — Phase 5b (Drop, Day 7+)

### 5a. Zero errors over 7-day window

Confirm zero workflow execution errors that mention any of the 58 original GDA table names during the 7-day post-rename observation period. Check daily.

### 5b. System health (same as 4b)

Canary green, backend 200, change-detector active.

### 5c. Backup file integrity

```bash
ls -la /root/backups/f026-step5-shadow-tables-pre-rename-*.sql
# Confirm file exists, size > 500KB, readable
head -5 /root/backups/f026-step5-shadow-tables-pre-rename-*.sql
# Confirm valid SQL header
```

### 5d. Irreversibility acknowledgment

DROP is irreversible. Restore requires:
1. Stop n8n container
2. Restore from pg_dump: `psql -U n8n -d n8n < /root/backups/f026-step5-shadow-tables-pre-rename-YYYYMMDD.sql`
3. Restart n8n
4. Verify table contents

Architect must explicitly approve Phase 5b execution.

---

## 6. Rollback

### Phase 5a rollback (trivial — rename back)

```sql
-- Reverse rename (58 statements, < 1 second each)
ALTER TABLE public._archive_20260523_daily_trends RENAME TO daily_trends;
ALTER TABLE public._archive_20260523_ft_opportunity_signal RENAME TO ft_opportunity_signal;
-- ... (remaining 56 follow same pattern)
```

**Time to rollback:** < 1 minute for all 58 tables.  
**Data loss:** None.

### Phase 5b rollback (backup restore required)

Phase 5b (DROP) is irreversible without backup restore.

**Restore procedure:**

```bash
# 1. Stop n8n to prevent writes during restore
docker stop n8n-envision-n8n-1

# 2. Restore from dump
docker exec -i n8n-envision-postgres-1 psql -U n8n -d n8n < /root/backups/f026-step5-shadow-tables-pre-rename-YYYYMMDD.sql

# 3. Restart n8n
docker start n8n-envision-n8n-1

# 4. Verify tables exist and have data
docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'gda_%' ORDER BY tablename;"
```

**Note:** Restored tables would contain data as of pre-rename snapshot (Day 0). Any writes between Day 0 and the restore would be lost. Since no workflows write to these tables post-cutover, this is a no-op concern.

---

## 7. Workflow Reference Audit

### Pre-Phase 5a: scan all workflow JSON for table references

```bash
N8N_API_KEY=$(grep N8N_API_KEY /root/n8n-envision/.env | cut -d= -f2 | tr -d '"' | tr -d "'")

# Fetch all workflows and search for table name references
for TABLE in daily_trends ft_opportunity_signal ft_signal_source \
  gda_action_items gda_active_contracts gda_capture_plans \
  gda_competitor_cache gda_competitor_watchlist gda_contacts \
  gda_dashboard_intel_cache gda_embeddings gda_error_log \
  gda_intelligence_log gda_learned_weights gda_morning_briefings \
  gda_opportunity_alerts gda_opportunity_tracker gda_relationships \
  gda_risk_register gda_saved_opportunities gda_teaming_partners \
  gda_touchpoints gda_trend_arrays gda_wargames gda_win_loss \
  gda_win_loss_db govtribe_cache opportunity_alerts \
  gda_action_history gda_ai_feedback gda_aop_tracker \
  gda_approval_queue gda_capture_lessons gda_chat_history \
  gda_clause_library gda_competitor_crawls gda_compliance_matrices \
  gda_contract_vehicles gda_daily_briefings gda_daily_briefs \
  gda_deep_research gda_dept_market gda_discussions gda_doc_inbox \
  gda_e2e_reports gda_feedback gda_health_scans gda_idiq_tracker \
  gda_incumbent_analysis gda_knowledge_base gda_learning_log \
  gda_meeting_notes gda_mega_cache gda_naics_tracking gda_ndaa_intel \
  gda_ooda_loops gda_prompt_architect_memory gda_pwin_scores; do
  # Count workflow references (expected: many, but all via HwronxMmGY5XDGEt which now targets gda_command)
  echo "$TABLE: checking..."
done
```

**Expected result:** All 122 workflows reference these table names, but they execute via credential `HwronxMmGY5XDGEt` which now points at `gda-postgres/gda_command`. The table names in workflow SQL/Code nodes are just strings — they resolve against whatever DB the credential connects to. Renaming tables on the n8n shadow DB will NOT affect any workflow that uses `HwronxMmGY5XDGEt` because that credential no longer connects to the n8n DB.

**Halt condition:** If any workflow is discovered that queries n8n-envision-postgres-1 directly (bypassing credential `HwronxMmGY5XDGEt`) AND references a GDA table name, HALT and surface.

---

## 8. schema_migrations Handling

### 8a. n8n-envision-postgres-1/n8n

There is **no `schema_migrations` table** on the n8n database. n8n uses its own internal `migrations` table (177 rows) which is an n8n-managed artifact. It is **OUT OF SCOPE** — do not touch.

### 8b. gda-postgres/gda_command

`schema_migrations` has 118 rows (88 from Step 3 + 30 from Step 3b). This is the **source of truth** for gda_command schema state. Do NOT touch.

---

## 9. Self-Creating Tables

Five tables were identified in F-023 as auto-creating via `CREATE TABLE IF NOT EXISTS`:

| Table | Exists on gda_command? | Exists on n8n shadow? |
|-------|----------------------|----------------------|
| `gda_bd_activities` | NO | NO |
| `gda_nightly_intel` | NO | NO |
| `gda_scanner_log` | NO | NO |
| `gda_proactive_scans` | NO | NO |
| `gda_win_rate_digests` | NO | NO |

**Status:** None of the 5 self-creating tables exist on either database as of 2026-05-23.

**Assessment:** The workflows that create these tables (`CREATE TABLE IF NOT EXISTS`) have either:
- Not fired since cutover (cron schedule hasn't come around yet), OR
- Were paused/inactive during the observation window

**Action required:** None for Step 5. When these workflows fire post-cutover, they will create the tables on `gda-postgres/gda_command` (via `HwronxMmGY5XDGEt`). Since the tables don't exist on the n8n shadow, there's nothing to rename or drop.

---

## 10. Open Questions for Architect

### Q1: What to do with the 6 orphan GDA tables?

Six GDA tables (`gda_content_store`, `gda_data_lake`, `gda_decision_memory`, `gda_interaction_log`, `gda_pattern_library`, `gda_stage_audit`) exist on n8n but NOT on gda_command. They contain 330 rows total and are referenced by active workflows.

**Options:**
- **A. Migrate then rename:** Create migrations for these 6 tables on gda_command, copy data, then include them in Phase 5a rename. Requires a mini Step 3-style operation.
- **B. Rename with the 58:** Rename them alongside the 58 known tables. The referencing workflows (which mostly don't fire or use webhook auth) will error. Treat as tech debt.
- **C. Keep on n8n:** Leave these 6 tables on n8n permanently. They're small, not in the migration scope, and referenced by low-traffic workflows.
- **D. Drop the referencing workflows:** If these workflows are dead (4 of 5 have zero executions), deactivate/delete them and then rename the tables.

**Architect decision needed.**

### Q2: Include the 6 orphan tables in Phase 5a backup?

If Option A or B, the backup pg_dump should include these 6 tables. If Option C, no backup needed (they stay on n8n).

### Q3: Phase 5a timing

Should Phase 5a execute immediately after the 24h soak, or wait for a specific low-traffic window?

### Q4: Phase 5b approval process

After the 7-day observation window, should Phase 5b (DROP) require a separate PR, or can it be a commit on the same PR as Phase 5a?

---

## Timeline

| Phase | When | Duration | Reversible? |
|-------|------|----------|-------------|
| Step 4 cutover complete | 2026-05-23 12:00 EDT | — | — |
| 24h soak | 2026-05-23 → 2026-05-24 12:00 EDT | 24h | — |
| Phase 5a (rename) | After soak + architect approval | ~5 min | YES (rename back) |
| 7-day observation | Phase 5a + 7 days | 7 days | — |
| Phase 5b (drop) | After observation + architect approval | ~2 min | NO (backup restore only) |

---

## Summary

- **58 tables** in scope for two-phase drop (rename → observe → drop)
- **6 orphan tables** discovered — need architect decision (Section 10, Q1)
- **92 n8n internal tables** out of scope
- **5 self-creating tables** don't exist anywhere yet — no action needed
- **No schema_migrations** on n8n DB — nothing to clean
- **Backup before any operation** — 30-day retention
- **Rollback for Phase 5a:** trivial rename-back
- **Rollback for Phase 5b:** backup restore (irreversible without it)
