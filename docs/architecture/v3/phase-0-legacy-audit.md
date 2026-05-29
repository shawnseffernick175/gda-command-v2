# Phase 0 — Legacy Backend Audit

**Program:** Backend V3 rebuild
**Phase:** 0 — Discovery
**Date:** 2026-05-29
**Author:** Devin (automated audit)
**Status:** Draft — awaiting human sign-off

> **Prod DB access:** SSH to both `HOSTINGER_VPS_IP` and `100.100.80.78` timed out (connection refused / timeout). All Section 1 data below comes from the **local dev database** built by applying all 134 migration files against a fresh `gda_command` database on the Docker `gda-postgres` container. Prod-specific row counts, disk sizes, and any data that exists only in prod (e.g., rows inserted by n8n workflows not in migration seeds) are marked **`UNVERIFIED — needs prod DB access`**. The schema itself is deterministic from migrations and is therefore accurate.

---

## Section 1 — Database inventory

### 1.1 Full table list

```
Command: docker exec gda-postgres psql -U gda -d gda_command -c "\dt public.*"
```

```
 Schema |            Name             | Type  | Owner
--------+-----------------------------+-------+-------
 public | action_item_drafts          | table | gda
 public | action_items                | table | gda
 public | agent_config                | table | gda
 public | agent_runs                  | table | gda
 public | ai_usage_log                | table | gda
 public | anomalies                   | table | gda
 public | anomaly_rules               | table | gda
 public | approval_queue              | table | gda
 public | approvals                   | table | gda
 public | audit_log                   | table | gda
 public | bid_assessments             | table | gda
 public | bid_recommendations         | table | gda
 public | bot_entities                | table | gda
 public | bot_glossary                | table | gda
 public | bot_sources                 | table | gda
 public | capture_activities          | table | gda
 public | capture_coach_results       | table | gda
 public | capture_gate_reviews        | table | gda
 public | capture_guardrail_alerts    | table | gda
 public | capture_plans               | table | gda
 public | captures                    | table | gda
 public | clause_references           | table | gda
 public | color_reviews               | table | gda
 public | company_entity              | table | gda
 public | company_profile             | table | gda
 public | competitor_movements        | table | gda
 public | competitor_profiles         | table | gda
 public | compliance_items            | table | gda
 public | compliance_requirements     | table | gda
 public | contacts                    | table | gda
 public | cpars_records               | table | gda
 public | daily_trends                | table | gda
 public | dashboard_layouts           | table | gda
 public | deep_research_reports       | table | gda
 public | discussion_messages         | table | gda
 public | discussion_threads          | table | gda
 public | doctrine_drafts             | table | gda
 public | doctrine_publish_runs       | table | gda
 public | document_embeddings         | table | gda
 public | email_log                   | table | gda
 public | enrichment_call_log         | table | gda
 public | escalation_rules            | table | gda
 public | escalations                 | table | gda
 public | export_jobs                 | table | gda
 public | extracted_requirements      | table | gda
 public | fast_track_matches          | table | gda
 public | feature_flags               | table | gda
 public | feed_config                 | table | gda
 public | financial_kpis              | table | gda
 public | fix_proposals               | table | gda
 public | fpds_awards                 | table | gda
 public | ft_opportunity_signal       | table | gda
 public | ft_signal_source            | table | gda
 public | gda_action_history          | table | gda
 public | gda_action_items            | table | gda
 public | gda_active_contracts        | table | gda
 public | gda_ai_feedback             | table | gda
 public | gda_aop_tracker             | table | gda
 public | gda_approval_queue          | table | gda
 public | gda_capture_lessons         | table | gda
 public | gda_capture_plans           | table | gda
 public | gda_chat_history            | table | gda
 public | gda_clause_library          | table | gda
 public | gda_competitor_cache        | table | gda
 public | gda_competitor_crawls       | table | gda
 public | gda_competitor_watchlist    | table | gda
 public | gda_compliance_matrices     | table | gda
 public | gda_contacts                | table | gda
 public | gda_content_store           | table | gda
 public | gda_contract_vehicles       | table | gda
 public | gda_daily_briefings         | table | gda
 public | gda_daily_briefs            | table | gda
 public | gda_dashboard_intel_cache   | table | gda
 public | gda_data_lake               | table | gda
 public | gda_decision_memory         | table | gda
 public | gda_deep_research           | table | gda
 public | gda_dept_market             | table | gda
 public | gda_discussions             | table | gda
 public | gda_doc_inbox               | table | gda
 public | gda_e2e_reports             | table | gda
 public | gda_embeddings              | table | gda
 public | gda_error_log               | table | gda
 public | gda_feedback                | table | gda
 public | gda_health_scans            | table | gda
 public | gda_idiq_tracker            | table | gda
 public | gda_incumbent_analysis      | table | gda
 public | gda_intelligence_log        | table | gda
 public | gda_interaction_log         | table | gda
 public | gda_knowledge_base          | table | gda
 public | gda_learned_weights         | table | gda
 public | gda_learning_log            | table | gda
 public | gda_meeting_notes           | table | gda
 public | gda_mega_cache              | table | gda
 public | gda_morning_briefings       | table | gda
 public | gda_naics_tracking          | table | gda
 public | gda_ndaa_intel              | table | gda
 public | gda_ooda_loops              | table | gda
 public | gda_opportunity_alerts      | table | gda
 public | gda_opportunity_tracker     | table | gda
 public | gda_pattern_library         | table | gda
 public | gda_prompt_architect_memory | table | gda
 public | gda_pwin_scores             | table | gda
 public | gda_relationships           | table | gda
 public | gda_risk_register           | table | gda
 public | gda_saved_opportunities     | table | gda
 public | gda_stage_audit             | table | gda
 public | gda_teaming_partners        | table | gda
 public | gda_touchpoints             | table | gda
 public | gda_trend_arrays            | table | gda
 public | gda_wargames                | table | gda
 public | gda_win_loss                | table | gda
 public | gda_win_loss_db             | table | gda
 public | generated_reports           | table | gda
 public | gov_source_feeds            | table | gda
 public | govtribe_cache              | table | gda
 public | govtribe_credit_ledger      | table | gda
 public | govwin_call_log             | table | gda
 public | intel_items                 | table | gda
 public | knowledge_chat_sessions     | table | gda
 public | knowledge_collections       | table | gda
 public | knowledge_documents         | table | gda
 public | launchpad_flags             | table | gda
 public | merger_opp_impacts          | table | gda
 public | mergers_acquisitions        | table | gda
 public | monthly_financials          | table | gda
 public | morning_briefings           | table | gda
 public | notifications               | table | gda
 public | opportunities               | table | gda
 public | opportunities_legacy        | table | gda
 public | opportunity_alerts          | table | gda
 public | ou_registry                 | table | gda
 public | partner_awards              | table | gda
 public | partner_intel_profiles      | table | gda
 public | partner_news_items          | table | gda
 public | pipeline_forecasts          | table | gda
 public | pipeline_items              | table | gda
 public | procurement_vehicles        | table | gda
 public | prompts                     | table | gda
 public | proposal_compliance_map     | table | gda
 public | proposal_section_versions   | table | gda
 public | proposal_sections           | table | gda
 public | proposals                   | table | gda
 public | pwin_models                 | table | gda
 public | record_version              | table | gda
 public | refresh_tokens              | table | gda
 public | report_templates            | table | gda
 public | risk_register               | table | gda
 public | sam_opportunities           | table | gda
 public | sam_scan_runs               | table | gda
 public | sam_verification_runs       | table | gda
 public | scheduled_reports           | table | gda
 public | schema_migrations           | table | gda
 public | shred_jobs                  | table | gda
 public | source_health_snapshots     | table | gda
 public | source_registry             | table | gda
 public | source_sync_runs            | table | gda
 public | system_health_snapshots     | table | gda
 public | teaming_flags               | table | gda
 public | uploaded_files              | table | gda
 public | user_invitations            | table | gda
 public | users                       | table | gda
 public | win_loss_analyses           | table | gda
```

**Total: 155 tables** (including `schema_migrations`).

### 1.2 Full enum/type list

```
Command: docker exec gda-postgres psql -U gda -d gda_command -c "\dT+ public.*"
```

| Name | Elements |
|---|---|
| `action_source` | `email`, `manual`, `sentinel`, `launchpad` |
| `action_status` | `open`, `done`, `blocked` |
| `color_review_stage` | `pink`, `red`, `gold`, `submitted` |
| `draft_kind` | `reply`, `research`, `milestone` |
| `draft_status` | `pending`, `approved`, `rejected` |
| `entity_status` | `legacy`, `merging`, `newco`, `subsidiary`, `partner` |
| `halfvec` | (pgvector extension type) |
| `ou_tag` | `envision`, `riverstone`, `pd_systems`, `teaming`, `gda_rollup` |
| `sparsevec` | (pgvector extension type) |
| `teaming_flag_reason` | `hubzone`, `v3_veteran`, `ic_clearance`, `training_depth`, `scope_overflow`, `de_confliction` |
| `vector` | (pgvector extension type) |

**Total: 11 types** (8 application enums + 3 pgvector extension types).

### 1.3 Per-table column inventory

> **Note:** Full `\d <table>` output for all 155 tables is prohibitively long. The schema is deterministically derived from the 134 migration files in `packages/backend/src/db/migrations/`. The initial schema (001) defines 45 tables; subsequent migrations add columns, tables, enums, and indexes.
>
> Key tables and their column counts (from migration files):
> - `opportunities` (Sprint 2, migration 129): 18 columns
> - `opportunities_legacy` (original, migration 001 renamed in 129): ~30 columns
> - `pipeline_items` (migration 129): 10 columns
> - `captures` (migration 130): 11 columns
> - `action_items` (migration 130): 13 columns
> - `users` (migration 001): 8 columns + role extensions (migration 019)
> - `record_version` (migration 034): versioning/soft-delete audit table
>
> **`UNVERIFIED — needs prod DB access`**: Prod may have additional columns added by n8n direct DDL that are not in migration files.

### 1.4 Row counts

```
Command: SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;
```

> **`UNVERIFIED — needs prod DB access`**: The counts below are from the local dev DB (migration seeds only). Prod will have significantly more rows from live data ingestion.

| Table | Dev rows (seed only) |
|---|---|
| `schema_migrations` | 134 |
| `bot_entities` | 27 |
| `bot_glossary` | 23 |
| `financial_kpis` | 16 |
| `bot_sources` | 15 |
| `procurement_vehicles` | 13 |
| `source_registry` | 9 |
| `feature_flags` | 9 |
| `escalation_rules` | 8 |
| `gov_source_feeds` | 7 |
| `agent_config` | 6 |
| `knowledge_collections` | 6 |
| `ou_registry` | 5 |
| `anomaly_rules` | 5 |
| `mergers_acquisitions` | 5 |
| `company_entity` | 4 |
| `monthly_financials` | 3 |
| `launchpad_flags` | 3 |
| `partner_intel_profiles` | 2 |
| `company_profile` | 1 |
| All other tables | 0 (no seed data) |

### 1.5 Index list

```
Command: SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;
```

**Total indexes: ~390.** Key patterns:

- Every table has a `_pkey` index on its primary key.
- `opportunities` (Sprint 2): 7 indexes (naics, agency, set_aside, response_due_at, grade, qualified_at, ou_tag).
- `pipeline_items`: 3 indexes (opportunity_id, capture_owner, ou_tag).
- `action_items`: 5 indexes (status, owner_email, due_date partial, ou_tag, source).
- `record_version`: 4 indexes for versioning lookups (table/record, table/record/version).
- `gda_*` n8n tables: most have 1–3 indexes (id, created_at).
- `document_embeddings`: includes HNSW vector index for pgvector similarity search + collection index.

### 1.6 Foreign key constraints

```
Command: SELECT tc.constraint_name, tc.table_name, kcu.column_name, ccu.table_name, ccu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ...
         WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
```

| Constraint | From table → column | To table → column |
|---|---|---|
| `action_item_drafts_action_item_id_fkey` | `action_item_drafts.action_item_id` | `action_items.id` |
| `agent_runs_agent_fkey` | `agent_runs.agent` | `agent_config.agent` |
| `anomaly_rules_created_by_fkey` | `anomaly_rules.created_by` | `users.id` |
| `approval_queue_agent_fkey` | `approval_queue.agent` | `agent_config.agent` |
| `approval_queue_agent_run_id_fkey` | `approval_queue.agent_run_id` | `agent_runs.id` |
| `audit_log_user_id_fkey` | `audit_log.user_id` | `users.id` |
| `bid_recommendations_opportunity_id_fkey` | `bid_recommendations.opportunity_id` | `opportunities_legacy.id` |
| `capture_activities_capture_plan_id_fkey` | `capture_activities.capture_plan_id` | `capture_plans.id` |
| `capture_gate_reviews_opportunity_id_fkey` | `capture_gate_reviews.opportunity_id` | `opportunities_legacy.id` |
| `capture_guardrail_alerts_opportunity_id_fkey` | `capture_guardrail_alerts.opportunity_id` | `opportunities_legacy.id` |
| `capture_plans_opportunity_id_fkey` | `capture_plans.opportunity_id` | `opportunities_legacy.id` |
| `captures_pipeline_item_id_fkey` | `captures.pipeline_item_id` | `pipeline_items.id` |
| `compliance_items_capture_id_fkey` | `compliance_items.capture_id` | `captures.id` |
| `dashboard_layouts_user_id_fkey` | `dashboard_layouts.user_id` | `users.id` |
| `discussion_messages_thread_id_fkey` | `discussion_messages.thread_id` | `discussion_threads.id` |
| `email_log_notification_id_fkey` | `email_log.notification_id` | `notifications.id` |
| `email_log_user_id_fkey` | `email_log.user_id` | `users.id` |
| `escalations_rule_id_fkey` | `escalations.rule_id` | `escalation_rules.id` |
| `extracted_requirements_shred_job_id_fkey` | `extracted_requirements.shred_job_id` | `shred_jobs.id` |
| `fix_proposals_agent_run_id_fkey` | `fix_proposals.agent_run_id` | `agent_runs.id` |
| `ft_opportunity_signal_source_id_fkey` | `ft_opportunity_signal.source_id` | `ft_signal_source.source_id` |
| `gda_decision_memory_opportunity_id_fkey` | `gda_decision_memory.opportunity_id` | `gda_opportunity_tracker.id` |
| `gda_touchpoints_relationship_id_fkey` | `gda_touchpoints.relationship_id` | `gda_relationships.id` |
| `generated_reports_template_id_fkey` | `generated_reports.template_id` | `report_templates.id` |
| `knowledge_documents_collection_id_fkey` | `knowledge_documents.collection_id` | `knowledge_collections.id` |
| `knowledge_documents_file_id_fkey` | `knowledge_documents.file_id` | `uploaded_files.id` |
| `knowledge_documents_parent_document_id_fkey` | `knowledge_documents.parent_document_id` | `knowledge_documents.id` |
| `merger_opp_impacts_merger_id_fkey` | `merger_opp_impacts.merger_id` | `mergers_acquisitions.id` |
| `merger_opp_impacts_opportunity_id_fkey` | `merger_opp_impacts.opportunity_id` | `opportunities_legacy.id` |
| `notifications_user_id_fkey` | `notifications.user_id` | `users.id` |
| `opportunities_pursuing_entity_id_fkey` | `opportunities_legacy.pursuing_entity_id` | `company_entity.entity_id` |
| `partner_awards_partner_ou_tag_fkey` | `partner_awards.partner_ou_tag` | `partner_intel_profiles.ou_tag` |
| `partner_news_items_partner_ou_tag_fkey` | `partner_news_items.partner_ou_tag` | `partner_intel_profiles.ou_tag` |
| `pipeline_items_opportunity_id_fkey` | `pipeline_items.opportunity_id` | `opportunities.id` |
| `proposal_compliance_map_proposal_id_fkey` | `proposal_compliance_map.proposal_id` | `proposals.id` |
| `proposal_compliance_map_section_id_fkey` | `proposal_compliance_map.section_id` | `proposal_sections.id` |
| `proposal_section_versions_section_id_fkey` | `proposal_section_versions.section_id` | `proposal_sections.id` |
| `proposals_opportunity_id_fkey` | `proposals.opportunity_id` | `opportunities_legacy.id` |
| `shred_jobs_opportunity_id_fkey` | `shred_jobs.opportunity_id` | `opportunities_legacy.id` |
| `source_sync_runs_source_id_fkey` | `source_sync_runs.source_id` | `source_registry.id` |
| `sam_verification_runs_user_id_fkey` | `sam_verification_runs.started_by` | `users.id` |

**Total: ~41 foreign key constraints.**

Notable: Many legacy tables (`bid_recommendations`, `capture_plans`, `capture_gate_reviews`, `capture_guardrail_alerts`, `merger_opp_impacts`, `proposals`, `shred_jobs`) FK to `opportunities_legacy` — the pre-Sprint 2 opportunities table. The new Sprint 2 `opportunities` table is referenced only by `pipeline_items`. This dual-table FK split is a key V3 migration concern.

### 1.7 Database size

```
Command: SELECT pg_database_size('gda_command'), pg_size_pretty(pg_database_size('gda_command'));
```

| Metric | Dev value |
|---|---|
| Database size | 17 MB |
| Largest table (by total relation size) | `gda_embeddings` (472 kB) |
| Second largest | `schema_migrations` (96 kB) |
| Third largest | `opportunities_legacy` (88 kB) |

**`UNVERIFIED — needs prod DB access`**: Prod database size, row counts, and table sizes will differ significantly due to live data.

---

## Section 2 — Migration inventory

### 2.1 Full list of migration files

```
Command: ls packages/backend/src/db/migrations/*.sql | wc -l
Result: 134 SQL files
```

| # | File | Lines | Summary |
|---|---|---|---|
| 001 | `001_initial_schema.sql` | 924 | Initial schema — 45 tables (users, opportunities, capture_plans, doctrine, intel, proposals, contacts, etc.) |
| 002 | `002_file_storage.sql` | 25 | `uploaded_files` table |
| 003 | `003_feed_config.sql` | 23 | `feed_config` table |
| 004 | `004_pgvector.sql` | 35 | pgvector extension + `document_embeddings` |
| 005 | `005_email_notifications.sql` | 28 | `email_log` table |
| 006 | `006_dashboard_layouts.sql` | 13 | `dashboard_layouts` table |
| 007 | `007_audit_log.sql` | 11 | Audit log enhancements |
| 008 | `008_color_review_file_id.sql` | 2 | Add `file_id` to `color_reviews` |
| 009 | `009_capture_stage.sql` | 9 | Add `capture_stage` column to opportunities |
| 010 | `010_opp_data_source.sql` | 7 | Add `data_source` column to opportunities |
| 011 | `011_approval_gate.sql` | 5 | Add approval gate columns to opportunities |
| 012 | `012_risk_register_and_company.sql` | 74 | `risk_register` + `company_profile` tables |
| 013 | `013_agent_infrastructure.sql` | 72 | `agent_config`, `agent_runs`, `approval_queue` |
| 014 | `014_capture_coach.sql` | 13 | `capture_coach_results` table |
| 015 | `015_fix_proposals.sql` | 42 | `fix_proposals` table |
| 016 | `016_company_intelligence.sql` | 37 | `gov_source_feeds` + competitor profile extensions |
| 017 | `017_book_of_truths_and_financial_kpis.sql` | 148 | `bot_entities`, `bot_glossary`, `bot_sources` + financial KPI seeds |
| 018 | `018_fix_bot_glossary_and_sources_columns.sql` | 61 | Fix missing columns on bot tables |
| 019 | `019_sprint2_header_kpis_and_roles.sql` | 48 | `anomaly_rules` + user role enhancements |
| 020 | `020_sprint2_contact_sources_and_roles.sql` | 22 | `user_invitations` + contact source columns |
| 021 | `021_escalation_rules_description.sql` | 3 | Add description to `escalation_rules` |
| 022 | `022_stage_override_index.sql` | 6 | Partial index for stage-override queries |
| 023 | `023_rename_backlog_kpi.sql` | 2 | Rename "Backlog" KPI to "Contract Backlog" |
| 024 | `024_seed_knowledge_collections.sql` | 31 | Seed default knowledge collections |
| 025 | `025_proposal_sections.sql` | 32 | `proposal_sections` table |
| 026 | `026_ooda_analysis.sql` | 9 | OODA analysis columns on opportunities |
| 027 | `027_remove_mock_data.sql` | 41 | Remove seeded mock data from prod |
| 028 | `028_fix_mock_data_patterns.sql` | 30 | Fix mock data removal patterns |
| 029 | `029_q1_2026_financial_kpis.sql` | 36 | Q1 FY2026 financial KPI data |
| 030 | `030_monthly_financials.sql` | 55 | `monthly_financials` table |
| 031 | `031_add_no_bid_status.sql` | 8 | Add `no_bid` to opportunities status constraint |
| 032 | `032_proposal_builder_enhancements.sql` | 38 | `proposal_section_versions`, `proposal_compliance_map` |
| 033 | `033_feature_flags.sql` | 24 | `feature_flags` table |
| 034 | `034_versioning_softdelete.sql` | 150 | `record_version` table + `fn_auto_version` trigger function (W3) |
| 035 | `035_opportunity_canonical_views.sql` | 26 | Canonical opportunity views (W7) |
| 036 | `036_company_entities.sql` | 119 | `company_entity` table (W4 merger context) |
| 036b | `036b_vehicle_classification.sql` | 36 | `procurement_vehicles` table (W1) |
| 037 | `037_expanded_sources.sql` | 58 | `source_registry`, `source_sync_runs` (W2) |
| 038 | `038_ensure_intel_summary.sql` | 12 | Fix `intel_items` schema + SAM enrichment fields |
| 038b | `038b_merger_context.sql` | 55 | `mergers_acquisitions`, `merger_opp_impacts` (W4) |
| 039 | `039_capture_discipline.sql` | 34 | `capture_gate_reviews`, `capture_guardrail_alerts` (W6) |
| 039b | `039b_pgvector_safe.sql` | 10 | Safe pgvector extension install |
| 040 | `040_ai_gateway.sql` | 34 | `ai_usage_log`, `enrichment_call_log` (W8) |
| 040b | `040b_seed_anomaly_rules.sql` | 17 | Seed default anomaly detection rules |
| 041 | `041_sam_poc_columns.sql` | 5 | POC columns on `sam_opportunities` |
| 042 | `042_competitor_profile_extended.sql` | 7 | Extended columns on `competitor_profiles` |
| 043 | `043_fix_duplicate_triggers.sql` | 46 | Fix duplicate versioning triggers (BROKEN-001) |
| 044 | `044_seed_version_zero.sql` | 33 | Seed version-0 snapshots (STALE-001) |
| 045 | `045_rename_duplicate_migrations.sql` | 15 | Fix duplicate migration numbers (F-010) |
| 046 | `046_sam_verification_runs.sql` | 21 | `sam_verification_runs` table (F-004) |
| 047 | `047_gov_source_deprecation.sql` | 20 | Mark deprecated gov source feeds |
| 048 | `048_cleanup_fake_dibbs_records.sql` | 16 | Clean up fake DIBBS records |
| 049 | `049_reverse_govtribe_deprecation.sql` | 12 | Reverse GovTribe deprecation |
| 050 | `050_govtribe_zapier_ingest.sql` | 29 | GovTribe Zapier ingest schema |
| 051 | `051_fix_incumbent_source_constraint.sql` | 12 | Fix incumbent_source CHECK constraint |
| 052 | `052_fix_migration_051_ordering.sql` | 15 | Fix migration 051 ordering |
| 053 | `053_govtribe_credit_ledger.sql` | 30 | `govtribe_credit_ledger` table |
| 054 | `054_source_health_snapshots.sql` | 22 | `source_health_snapshots` table |
| 055 | `055_govwin_wsapi_integration.sql` | 25 | `govwin_call_log` table |
| 056 | `056_schema_migrations_provenance.sql` | 15 | Add provenance columns to `schema_migrations` |
| 057–084 | `057_n8n_gda_*.sql` through `084_n8n_gda_contacts.sql` | 5–30 each | **n8n shadow tables** — 28 tables created for n8n workflow data storage (see Section 3) |
| 085–120 | `085_step3b_*.sql` through `120_step4b_*.sql` | 5–30 each | **Step 3b/4b shadow tables** — 36 more shadow tables for n8n (see Section 3) |
| 121 | `121_knowledge_status_add_skipped.sql` | 9 | Add `skipped` to knowledge_documents status |
| 122 | `122_system_health_snapshots.sql` | 19 | `system_health_snapshots` table (F-039 Sentinel) |
| 123 | `123_demote_gda_role.sql` | 140 | Least-privilege Postgres roles (F-020): `gda_runtime` role |
| 124 | `124_universal_ingestion.sql` | 22 | Parent/child doc tracking on `knowledge_documents` (F-038) |
| 125 | `125_vector_embeddings_dual_write.sql` | 23 | Add collection + metadata to `document_embeddings` (Pinecone→pgvector) |
| 126 | `126_staging_banner_off.sql` | 7 | Disable staging banner for prod |
| 127 | `127_ou_registry_launchpad_flags.sql` | 75 | `ou_tag` enum, `ou_registry`, `launchpad_flags` (F-100 Sprint 1) |
| 128 | `128_riverstone_uei_confirmed.sql` | 10 | Riverstone UEI update in `ou_registry` |
| 129 | `129_sprint2_opps_pipeline_partner_intel.sql` | 180 | Sprint 2: `opportunities` (new), `pipeline_items`, `partner_intel_profiles`, `teaming_flags`, `partner_awards`, `partner_news_items`; renames old `opportunities` → `opportunities_legacy` |
| 130 | `130_sprint3_capture_action_items.sql` | 105 | Sprint 3: `captures`, `compliance_items`, `action_items`, `action_item_drafts` + enums |

### 2.2 Migration history table

```
Command: SELECT name, applied_at FROM schema_migrations ORDER BY id;
```

All 134 migrations are recorded in `schema_migrations` with `applied_at` timestamps. On dev, all applied at `2026-05-29 15:53:43–44+00` (batch apply).

**`UNVERIFIED — needs prod DB access`**: Prod `schema_migrations` table would show actual historical application dates.

### 2.3 Diff between files-on-disk and applied-in-prod

On dev: **134 migration files on disk = 134 rows in `schema_migrations`**. Perfect match. No orphans in either direction.

**`UNVERIFIED — needs prod DB access`**: Cannot confirm prod alignment without SSH.

### 2.4 Ten most recent migrations (121–130): full contents and effect

**Migration 121 — `121_knowledge_status_add_skipped.sql`**

```sql
ALTER TABLE knowledge_documents
  DROP CONSTRAINT IF EXISTS knowledge_documents_status_check;
ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_status_check
  CHECK (status = ANY (ARRAY['indexed', 'processing', 'failed', 'pending', 'skipped']));
```

Effect: Landed. Adds `skipped` as valid status for auto-vectorize empty-text documents.

**Migration 122 — `122_system_health_snapshots.sql`**

```sql
CREATE TABLE system_health_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  taken_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overall_status  TEXT NOT NULL CHECK (overall_status IN ('healthy','degraded','down','unknown')),
  components      JSONB NOT NULL,
  failing_count   INT NOT NULL DEFAULT 0,
  reason          TEXT,
  meta            JSONB
);
CREATE INDEX idx_health_snapshots_taken_at ON system_health_snapshots(taken_at DESC);
CREATE INDEX idx_health_snapshots_status ON system_health_snapshots(overall_status, taken_at DESC);
```

Effect: Landed. New table for F-039 Health Sentinel periodic snapshots.

**Migration 123 — `123_demote_gda_role.sql`**

140-line migration implementing least-privilege Postgres roles (F-020). Creates `gda_runtime` role with DML-only grants. Has bootstrap path (CI/admin) and auto-deploy path (gda_app). Includes grants on all existing tables, sequences, functions, and default privileges for future objects.

Effect: Landed on dev (bootstrap path). **`UNVERIFIED — needs prod DB access`** to confirm runtime role was bootstrapped on VPS.

**Migration 124 — `124_universal_ingestion.sql`**

```sql
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS parent_document_id TEXT NULL REFERENCES knowledge_documents(id) ON DELETE SET NULL;
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS extraction_method TEXT NULL;
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS status_reason TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_parent ON knowledge_documents(parent_document_id) WHERE parent_document_id IS NOT NULL;
```

Effect: Landed. Adds parent/child tracking + extraction method for F-038 universal ingestion.

**Migration 125 — `125_vector_embeddings_dual_write.sql`**

```sql
ALTER TABLE document_embeddings ADD COLUMN IF NOT EXISTS collection TEXT NOT NULL DEFAULT 'knowledge';
ALTER TABLE document_embeddings ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS document_embeddings_collection_idx ON document_embeddings(collection);
ALTER TABLE document_embeddings DROP CONSTRAINT IF EXISTS document_embeddings_document_id_fkey;
```

Effect: Landed. Extends pgvector store for Pinecone→pgvector dual-write. Drops FK on document_id so n8n can write embeddings for non-knowledge documents.

**Migration 126 — `126_staging_banner_off.sql`**

```sql
UPDATE feature_flags SET enabled = false, updated_at = NOW() WHERE flag_key = 'staging_banner';
```

Effect: Landed. Disables misleading staging banner on production (gda.csr-llc.tech IS production).

**Migration 127 — `127_ou_registry_launchpad_flags.sql`**

75-line migration. Creates `ou_tag` enum, `ou_registry` reference table (seeded with 5 OUs), and `launchpad_flags` table (seeded with 3 critical Day-1 flags: CIO-SP3 expired, CMMI-DEV ML3 expiring, Mentor-Protégé urgent).

Effect: Landed. Foundation for Sprint 1 rebuild (F-100).

**Migration 128 — `128_riverstone_uei_confirmed.sql`**

```sql
UPDATE ou_registry SET uei = 'TECGLUBFP6N6', notes = '...' WHERE ou_tag = 'riverstone' AND (uei IS NULL OR uei = '');
```

Effect: Landed. Confirms Riverstone UEI from FPDS data.

**Migration 129 — `129_sprint2_opps_pipeline_partner_intel.sql`**

180-line migration. Renames legacy `opportunities` → `opportunities_legacy`. Creates new Sprint 2 `opportunities` table (with `ou_tag`, `sam_notice_id`, `grade`, `grade_evidence`, etc.), `pipeline_items`, `partner_intel_profiles` (seeded with Riverstone + PD Systems profiles), `teaming_flags`, `partner_awards`, `partner_news_items`.

Effect: Landed. Core Sprint 2 schema (F-101). This is the table-rename that creates the dual-opportunities situation.

**Migration 130 — `130_sprint3_capture_action_items.sql`**

105-line migration. Creates enums (`color_review_stage`, `action_source`, `action_status`, `draft_kind`, `draft_status`) and tables (`captures`, `compliance_items`, `action_items`, `action_item_drafts`).

Effect: Landed. Sprint 3 schema (F-102).

---

## Section 3 — Shadow object inventory

### 3.1 Cross-reference: tables in DB vs. CREATE TABLE in migrations

Every table in Section 1.1 has a corresponding `CREATE TABLE` statement in at least one migration file. There are **no tables in the database that lack a migration origin**. The full cross-reference was performed by:

```
Command: grep -rn "CREATE TABLE" packages/backend/src/db/migrations/*.sql | sed 's/.*CREATE TABLE IF NOT EXISTS //' | sed 's/.*CREATE TABLE //' | sed 's/ (.*//' | sort -u
```

Both lists (155 tables from `\dt public.*` and 155 unique table names from `CREATE TABLE`) match exactly.

### 3.2 Shadow objects: tables created for n8n that have no backend route code reference

The following tables exist in the database and are created by migration files, but are **not referenced by any file in `packages/backend/src/routes/`**. These are "shadow tables" — created to hold data for n8n workflows that bypass the Express API.

**n8n shadow tables (migrations 057–084, prefix `gda_` or `n8n_`):**

| Table | Migration | Purpose |
|---|---|---|
| `gda_relationships` | 057 | CRM relationship tracking |
| `gda_touchpoints` | 058 | Relationship touchpoints |
| `gda_risk_register` | 059 | n8n risk register |
| `gda_opportunity_tracker` | 060 | n8n opportunity tracker |
| `gda_capture_plans` | 061 | n8n capture plans |
| `gda_intelligence_log` | 062 | Intelligence log entries |
| `gda_competitor_watchlist` | 063 | Competitor watchlist |
| `gda_opportunity_alerts` | 064/070 | Opportunity alert records |
| `gda_competitor_cache` | 065 | Competitor data cache |
| `gda_action_items` | 066 | n8n action items (parallel to Sprint 3 `action_items`) |
| `gda_active_contracts` | 067 | Active contract tracking |
| `gda_dashboard_intel_cache` | 068 | Dashboard intel cache |
| `daily_trends` | 069 | Daily trend metrics |
| `gda_morning_briefings` | 071 | Morning briefing data |
| `gda_learned_weights` | 072 | ML learned weights |
| `gda_win_loss` | 073 | Win/loss data |
| `gda_error_log` | 074 | n8n error log |
| `gda_saved_opportunities` | 075 | Saved/bookmarked opportunities |
| `gda_teaming_partners` | 076 | Teaming partner records |
| `ft_signal_source` | 077 | Fast Track signal sources |
| `ft_opportunity_signal` | 078 | Fast Track opportunity signals |
| `gda_embeddings` | 079 | n8n vector embeddings |
| `govtribe_cache` | 080 | GovTribe API response cache |
| `gda_wargames` | 081 | War game scenarios |
| `gda_win_loss_db` | 082 | Win/loss database |
| `gda_trend_arrays` | 083 | Trend array data |
| `gda_contacts` | 084 | n8n contacts (parallel to legacy `contacts`) |

**Step 3b/4b shadow tables (migrations 085–120):**

| Table | Migration | Purpose |
|---|---|---|
| `gda_action_history` | 085 | Action audit history |
| `gda_ai_feedback` | 086 | AI feedback loop |
| `gda_aop_tracker` | 087 | Annual operating plan tracker |
| `gda_approval_queue` | 088 | n8n approval queue (parallel to `approval_queue`) |
| `gda_capture_lessons` | 089 | Capture lessons learned |
| `gda_chat_history` | 090 | Chat session history |
| `gda_clause_library` | 091 | Contract clause library |
| `gda_competitor_crawls` | 092 | Competitor web crawl data |
| `gda_compliance_matrices` | 093 | Compliance matrix storage |
| `gda_contract_vehicles` | 094 | Contract vehicle tracking |
| `gda_daily_briefings` | 095 | Daily briefing storage |
| `gda_daily_briefs` | 096 | Daily brief summaries |
| `gda_deep_research` | 097 | Deep research storage |
| `gda_dept_market` | 098 | Department market analysis |
| `gda_discussions` | 099 | n8n discussions |
| `gda_doc_inbox` | 100 | Document inbox |
| `gda_e2e_reports` | 101 | End-to-end reports |
| `gda_feedback` | 102 | User feedback |
| `gda_health_scans` | 103 | Health scan results |
| `gda_idiq_tracker` | 104 | IDIQ tracking |
| `gda_incumbent_analysis` | 105 | Incumbent analysis storage |
| `gda_knowledge_base` | 106 | Knowledge base (n8n version) |
| `gda_learning_log` | 107 | Learning log entries |
| `gda_meeting_notes` | 108 | Meeting note storage |
| `gda_mega_cache` | 109 | Mega dashboard cache |
| `gda_naics_tracking` | 110 | NAICS code tracking |
| `gda_ndaa_intel` | 111 | NDAA intelligence |
| `gda_ooda_loops` | 112 | OODA loop analysis |
| `gda_prompt_architect_memory` | 113 | Prompt architect memory |
| `gda_pwin_scores` | 114 | Pwin score history |
| `gda_pattern_library` | 115 | Proposal pattern library |
| `gda_stage_audit` | 116 | Stage transition audit |
| `gda_content_store` | 117 | Content storage |
| `gda_data_lake` | 118 | Data lake entries |
| `gda_decision_memory` | 119 | Decision memory (FK to `gda_opportunity_tracker`) |
| `gda_interaction_log` | 120 | Interaction log |

**Total: 63 shadow tables** that exist in the DB but have no backend route code reference.

Additional unreferenced legacy tables (not n8n shadow):

| Table | Created in | Note |
|---|---|---|
| `opportunities_legacy` | 001 (renamed in 129) | Original opportunities table, still FK'd by many legacy tables |
| `opportunity_alerts` | 064 | Separate from `gda_opportunity_alerts` |
| `bid_assessments` | 001 | Predictive module, no route references it directly |
| `pipeline_forecasts` | 001 | Monte Carlo forecast, never wired to routes |
| `pwin_models` | 001 | ML Pwin models, no route code |
| `win_loss_analyses` | 001 | Win/loss analysis, no route code |
| `knowledge_chat_sessions` | 001 | Chat sessions, no route code |
| `deep_research_reports` | 001 | Deep research, queries go through n8n webhooks |
| `capture_coach_results` | 014 | Capture coach, queries go through agents |
| `govtribe_credit_ledger` | 053 | Credit tracking, used by lib/gov-sources.ts but not routes directly |

### 3.3 Shadow object creators

All shadow objects were created by **migration files** committed to the repository. The `gda_*` prefixed tables (migrations 057–120) were added in two batch waves:

- **Wave 1 (057–084):** Prefix `n8n_gda_*` or `gda_*`. Created to match n8n workflow table expectations. Creator: Devin sessions (per git commit history).
- **Wave 2 (085–120):** Prefix `step3b_gda_*` or `step4b_gda_*`. Created as a bulk provisioning step. Creator: Devin sessions (per git commit history).

No tables were found that were created by direct `psql` sessions or n8n workflow DDL outside of migration files (on dev). **`UNVERIFIED — needs prod DB access`** for prod-only shadow objects.

### 3.4 Reconciliation with F-023 (issue #258)

F-023 (Shadow Schema DDL, issue #258) was the original effort to formalize n8n shadow tables into migration files. The current state shows that effort was completed — all 63 shadow tables now have corresponding migration files (057–120). The schema is formally tracked, though none of these tables are referenced by backend route code.

---

## Section 4 — Backend code inventory

### 4.1 All routes

```
Command: grep -rn "app.use" packages/backend/src/server.ts
```

| Mount path | Route file | Key endpoints (method + path) | Purpose |
|---|---|---|---|
| `/api/auth` | `auth.ts` | POST `/login`, POST `/register`, POST `/refresh`, GET `/me`, POST `/logout` | Authentication |
| `/api/ingest` | `ingest.ts` | POST `/opportunities`, POST `/fpds`, POST `/intel`, POST `/sam-opportunities`, POST `/competitor-movements`, POST `/govtribe`, POST `/govwin` | Data ingestion from n8n/cron |
| `/api/sentinel` | `sentinel.ts` | GET `/health`, GET `/status`, POST `/scan` | System health monitoring |
| `/api/launchpad` | `launchpad.ts` | GET `/`, GET `/flags`, PATCH `/flags/:id/dismiss` | Launchpad dashboard + flags |
| `/api/internal` | `vector-internal.ts` | POST `/vector-upsert`, `/vector-delete`, `/vector-query`, `/vector-fetch`, `/vector-ingest-url`, etc. | Internal pgvector operations |
| `/api/qa` | `qa.ts` | GET `/health`, POST `/dry-run`, GET `/latest-failures`, GET `/sam-verify`, GET `/source-health`, GET `/govtribe-health`, POST `/source-health/snapshot` | QA and source health |
| `/api/workflows` | `workflows.ts` | GET `/registry` | n8n workflow registry |
| `/api/opportunities` | `opportunities.ts` + `opportunities/analysis.ts` | GET `/ops-tracker`, GET `/:id`, POST `/qualify`, POST `/:id/analyze` | Opportunity listing + OODA analysis |
| `/api/opportunities` | `opportunities-v2.ts` | GET `/`, GET `/:id`, POST `/`, PATCH `/:id` | Sprint 2 opportunity CRUD |
| `/api/dashboard` | `dashboard.ts` | GET `/mega`, GET `/funnel`, GET `/trends`, GET `/actions` | Dashboard data (via n8n webhooks) |
| `/api/doctrine` | `doctrine.ts` | GET `/`, POST `/`, PUT `/:id`, GET `/publish-runs` | Doctrine management |
| `/api/intel` | `intel.ts` | GET `/`, GET `/research-history`, POST `/deep-research` | Intelligence feed |
| `/api/capture` | `capture.ts` | GET `/plans`, GET `/plans/:id`, POST `/plans` | Capture plan management (via n8n) |
| `/api/settings` | `settings.ts` | GET `/`, PUT `/`, GET `/status` | App settings + integration status |
| `/api/financials` | `financials.ts` | GET `/kpis`, GET `/monthly`, POST `/upload` | Financial Bible |
| `/api/approvals` | `approvals.ts` | GET `/`, POST `/`, PATCH `/:id` | Approval workflows |
| `/api/compliance` | `compliance.ts` | GET `/`, POST `/`, PUT `/:id` | Compliance requirements |
| `/api/proposals` | `proposals.ts` | GET `/`, GET `/:id`, POST `/`, PUT `/:id` | Proposal management |
| `/api/contacts` | `contacts.ts` | GET `/`, GET `/:id`, POST `/`, PUT `/:id` | Contact directory |
| `/api/reports` | `reports.ts` | GET `/templates`, POST `/generate` | Report generation |
| `/api/enrichments` | `enrichments.ts` | POST `/pwin`, POST `/incumbent`, POST `/competitor-field`, POST `/blackhat`, POST `/wargame` | AI enrichment (via n8n webhooks) |
| `/api/prompts` | `prompts.ts` | GET `/`, POST `/`, PUT `/:id` | Prompt library |
| `/api/fast-track` | `fast-track.ts` | GET `/matches`, GET `/signals` | Fast Track tech leads |
| `/api/knowledge` | `knowledge.ts` | GET `/collections`, POST `/documents`, GET `/search` | Knowledge base |
| `/api/rfp-shredder` | `rfp-shredder.ts` | POST `/shred`, GET `/jobs/:id` | RFP document shredding |
| `/api/predictive` | `predictive.ts` | GET `/models`, GET `/forecast`, POST `/assess` | Predictive analytics |
| `/api/color-review` | `color-review.ts` | GET `/`, POST `/`, PATCH `/:id` | Color review (Pink/Red/Gold) |
| `/api/anomaly` | `anomaly.ts` | GET `/`, GET `/rules`, POST `/rules` | Anomaly detection |
| `/api/sam-monitor` | `sam-monitor.ts` | GET `/`, POST `/scan` | SAM.gov monitoring |
| `/api/discussions` | `discussions.ts` | GET `/threads`, POST `/threads`, POST `/messages` | Discussion threads |
| `/api/cpars` | `cpars.ts` | GET `/`, POST `/`, PUT `/:id` | CPAR records |
| `/api/fpds` | `fpds.ts` | GET `/awards`, GET `/search` | FPDS award data |
| `/api/backup` | `backup.ts` | POST `/`, GET `/list` | Database backup |
| `/api/admin` | `admin.ts` | GET `/users`, POST `/users`, PATCH `/users/:id` | User admin |
| `/api/files` | `files.ts` | POST `/upload`, GET `/:id` | File storage |
| `/api/feeds` | `feeds.ts` | GET `/`, POST `/sync` | Feed management |
| `/api/email` | `email.ts` | POST `/send`, GET `/log` | Email operations |
| `/api/dashboard-layout` | `dashboard-layout.ts` | GET `/`, PUT `/` | Dashboard layout customization |
| `/api/audit` | `audit.ts` | GET `/` | Audit log viewer |
| `/api/export` | `export.ts` | POST `/`, GET `/:id` | Data export |
| `/api/ai` | `ai.ts` | POST `/chat`, POST `/summarize` | AI chat/summarize |
| `/api/ask` | (inline) | POST `/` | AI ask endpoint |
| `/api/book-of-truths` | `book-of-truths.ts` | GET `/entities`, GET `/glossary`, GET `/sources` | Book of Truths |
| `/api/govwin` | `govwin.ts` | GET `/summary`, GET `/opportunities`, POST `/sync` | GovWin IQ integration |
| `/api/govtribe` | `govtribe.ts` | GET `/`, POST `/search`, GET `/health` | GovTribe integration |
| `/api/risk-register` | `risk-register.ts` | GET `/`, POST `/`, PUT `/:id` | Risk register |
| `/api/company-profile` | `company-profile.ts` | GET `/`, GET `/entities` | Company profile |
| `/api/agents/morning-commander` | `morning-commander.ts` | POST `/trigger`, GET `/latest` | Morning Commander agent |
| `/api/agents/opportunity-watch` | `opportunity-watch.ts` | POST `/trigger`, GET `/latest` | Opportunity Watch agent |
| `/api/agents/competitive-intel` | `competitive-intel.ts` | POST `/trigger`, GET `/latest`, GET `/history` | Competitive Intel agent |
| `/api/agents/capture-coach` | `capture-coach.ts` | POST `/trigger`, GET `/analysis/:oppId` | Capture Coach agent |
| `/api/agents/fix-runner` | `controlled-fix.ts` | POST `/trigger`, GET `/proposals` | Controlled Fix agent |
| `/api/agents` | `agents.ts` | GET `/`, GET `/:agent/config`, PUT `/:agent/config` | Agent management |
| `/api/feature-flags` | `feature-flags.ts` | GET `/`, PUT `/:key` | Feature flag management |
| `/api/n8n/:webhook` | `n8n-proxy.ts` | POST `/:webhook`, GET `/:webhook` | Generic n8n webhook proxy |
| `/api/pipeline` | `pipeline-v2.ts` | GET `/`, GET `/:id`, POST `/`, PATCH `/:id` | Sprint 2 pipeline CRUD |
| `/api/partner-intel` | `partner-intel.ts` | GET `/profiles`, GET `/teaming-flags`, GET `/awards`, GET `/news` | Partner Intel |
| `/api/captures` | `captures.ts` | GET `/`, GET `/:id`, POST `/`, PATCH `/:id` | Sprint 3 captures CRUD |
| `/api/versioning` | `versioning.ts` | GET `/history/:table/:id`, GET `/diff` | Record version history |
| `/api/mergers` | `mergers.ts` | GET `/`, GET `/:id`, POST `/`, PUT `/:id`, POST `/:id/impacts` | Mergers & acquisitions |
| `/api/sources` | `sources.ts` | GET `/registry`, GET `/sync-runs` | Source registry |
| `/api/compliance-items` | `compliance-items.ts` | GET `/`, POST `/`, PATCH `/:id` | Sprint 3 compliance items |
| `/api/action-items` | `action-items.ts` | GET `/`, POST `/`, PATCH `/:id`, POST `/ingest-email`, POST `/:id/approve-draft/:draft_id` | Sprint 3 action items |
| `/api/ai-gateway` | `ai-gateway.ts` | GET `/status`, POST `/summarize`, POST `/opportunity-analyze`, GET `/bid-recommendations/:id`, GET `/usage` | AI gateway |

### 4.2 DB models / query helpers

The backend uses **raw SQL via `pg` Pool** (`getPool()` from `packages/backend/src/lib/db.ts`). There is no ORM. Query patterns:

| File | Tables touched |
|---|---|
| `lib/db.ts` | Connection pool (all tables) |
| `db/queries/opportunity-sources.ts` | `source_registry`, `source_sync_runs`, opportunities |
| `routes/opportunities-v2.ts` | `opportunities` (Sprint 2) |
| `routes/pipeline-v2.ts` | `pipeline_items`, `opportunities` |
| `routes/partner-intel.ts` | `partner_intel_profiles`, `teaming_flags`, `partner_awards`, `partner_news_items`, `ou_registry` |
| `routes/captures.ts` | `captures`, `pipeline_items`, `opportunities` |
| `routes/action-items.ts` | `action_items`, `action_item_drafts` |
| `routes/launchpad.ts` | `launchpad_flags`, `opportunities`, `pipeline_items`, `action_items` |
| `routes/ingest.ts` | `opportunities`, `sam_opportunities`, `fpds_awards`, `intel_items`, `competitor_profiles`, `competitor_movements`, `govtribe_cache`, `govwin_call_log` |
| `routes/qa.ts` | `source_registry`, `source_sync_runs`, `source_health_snapshots`, `sam_verification_runs`, `govtribe_credit_ledger`, `gov_source_feeds` |
| `routes/financials.ts` | `financial_kpis`, `monthly_financials` |
| `routes/knowledge.ts` | `knowledge_collections`, `knowledge_documents`, `uploaded_files` |
| `routes/sentinel.ts` | `system_health_snapshots` |
| `routes/versioning.ts` | `record_version` |
| `routes/mergers.ts` | `mergers_acquisitions`, `merger_opp_impacts` |
| `routes/company-entities.ts` | `company_entity` |
| `routes/compliance-items.ts` | `compliance_items` |
| `lib/gov-sources.ts` | `gov_source_feeds`, `govtribe_credit_ledger`, `opportunities` |
| `lib/govwin-client.ts` | `govwin_call_log` |
| `lib/health-sentinel.ts` | `system_health_snapshots`, various probe targets |

### 4.3 All env vars consumed by backend

```
Command: grep -r "process.env.\w+" packages/backend/src/ --include="*.ts" -o | sed 's/process.env.//' | sort -u
```

| Env var | Where used | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `lib/llm.ts` | Anthropic Claude API key |
| `APP_URL` | `lib/email.ts` | Application URL for email links |
| `AUTH_REQUIRED` | `lib/auth.ts`, `routes/launchpad.ts` | Toggle auth enforcement |
| `BACKUP_DIR` | `routes/backup.ts` | Database backup directory |
| `DATABASE_URL` | `lib/db.ts`, `db/migrate.ts` | Primary Postgres connection |
| `DEPLOY_COMMIT_SHA` | `db/migrate.ts` | Deployment tracking |
| `DRIFT_DATABASE_URL` | `db/check-migration-drift.ts` | Migration drift check |
| `FEED_SYNC_INTERVAL_HOURS` | `server.ts` | Feed sync interval |
| `GDA_WEBHOOK_KEY` | `lib/n8n-client.ts`, 11 route files | Shared auth key for n8n/ingest endpoints |
| `GOVTRIBE_API_KEY` | `lib/gov-sources.ts`, `routes/qa.ts`, `routes/settings.ts` | GovTribe API key |
| `GOVTRIBE_CYCLE_CREDIT_CAP` | `lib/gov-sources.ts` | GovTribe credit cap per cycle |
| `GOVTRIBE_MONTHLY_CREDIT_CAP` | `lib/gov-sources.ts` | GovTribe monthly credit cap |
| `GOVWIN_CLIENT_ID` | `routes/settings.ts` | GovWin OAuth2 client ID |
| `GOVWIN_CLIENT_SECRET` | `lib/health-sentinel.ts`, `routes/qa.ts`, `routes/settings.ts` | GovWin OAuth2 client secret |
| `GOVWIN_PASSWORD` | `lib/health-sentinel.ts`, `routes/qa.ts`, `routes/settings.ts` | GovWin password grant |
| `GOVWIN_SAVED_SEARCH_IDS` | `lib/govwin-client.ts` | GovWin saved search IDs |
| `GOVWIN_USERNAME` | `routes/settings.ts` | GovWin username |
| `JWT_SECRET` | `lib/auth.ts` | JWT token signing |
| `LOG_LEVEL` | `lib/logger.ts` | Logging verbosity |
| `MAX_INGEST_URL_BYTES` | `routes/vector-internal.ts` | Max URL ingest size |
| `MIGRATION_DATABASE_URL` | `db/migrate.ts` | Migration-specific DB URL |
| `MIGRATION_SKIP_MANIFEST_CHECK` | `db/migrate.ts` | Skip manifest integrity check |
| `N8N_API_BASE` | `lib/n8n-client.ts` | n8n REST API base URL |
| `N8N_API_KEY` | `lib/n8n-client.ts` | n8n REST API key |
| `N8N_BASE_URL` | `lib/n8n-client.ts`, `routes/ingest.ts` | n8n webhook base URL |
| `N8N_DATABASE_URL` | `lib/health-sentinel.ts` | n8n database URL (for health probes) |
| `NODE_ENV` | `routes/settings.ts`, `server.ts` | Environment mode |
| `OCR_ENABLED` | `lib/ocr-extractor.ts` | OCR feature toggle |
| `OPENAI_API_KEY` | `lib/llm.ts` | OpenAI API key |
| `PINECONE_API_KEY` | `routes/vector-internal.ts` | Pinecone vector DB API key |
| `PINECONE_HOST` | `routes/vector-internal.ts` | Pinecone host URL |
| `PORT` | `server.ts` | Server listen port |
| `QA_CHECK_TIMEOUT_MS` | `routes/qa.ts` | QA health check timeout |
| `QUALIFY_WRITES_ENABLED` | `routes/opportunities.ts` | Toggle qualify writes |
| `RUN_BACKFILL_TEST` | test files | Test-only flag |
| `SAM_API_KEY` | `lib/sam-api.ts` | SAM.gov API key |
| `SMTP_FROM` | `lib/email.ts` | SMTP from address |
| `SMTP_HOST` | `lib/email.ts` | SMTP server host |
| `SMTP_PASS` | `lib/email.ts` | SMTP password |
| `SMTP_PORT` | `lib/email.ts` | SMTP port |
| `SMTP_SECURE` | `lib/email.ts` | SMTP TLS toggle |
| `SMTP_USER` | `lib/email.ts` | SMTP username |
| `UPLOAD_DIR` | `routes/files.ts` | File upload directory |
| `URL_INGEST_ALLOWED_HOSTS` | `routes/vector-internal.ts` | Allowed hosts for URL ingest |

**Total: 44 env vars.**

### 4.4 All external API integrations

| Integration | Host | Auth method | Env vars | Purpose |
|---|---|---|---|---|
| **SAM.gov** | `api.sam.gov/opportunities/v2/search` | API key header | `SAM_API_KEY` | Opportunity search and enrichment |
| **USAspending / FPDS** | `api.usaspending.gov/api/v2` | None (public API) | — | Award data retrieval |
| **GovTribe** | `govtribe.com/mcp` (MCP server) | API key header | `GOVTRIBE_API_KEY` | Opportunity, award, forecast data (57 tools) |
| **GovWin IQ** | `services.govwin.com/neo-ws` | OAuth2 password grant | `GOVWIN_CLIENT_ID`, `GOVWIN_CLIENT_SECRET`, `GOVWIN_USERNAME`, `GOVWIN_PASSWORD` | Opportunity intelligence |
| **n8n** | `N8N_BASE_URL` (https://n8n.csr-llc.tech) | API key header | `N8N_BASE_URL`, `N8N_API_BASE`, `N8N_API_KEY`, `GDA_WEBHOOK_KEY` | Workflow orchestration |
| **OpenAI** | OpenAI API | API key header | `OPENAI_API_KEY` | LLM completions |
| **Anthropic** | Anthropic API | API key header | `ANTHROPIC_API_KEY` | LLM completions (Claude) |
| **Pinecone** | `PINECONE_HOST` | API key header | `PINECONE_API_KEY`, `PINECONE_HOST` | Vector similarity search (being migrated to pgvector) |
| **SMTP** | `SMTP_HOST` | Basic auth | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email notifications |

---

## Section 5 — n8n integration inventory

### 5.1 n8n webhooks used by GDA backend

The backend maintains a centralized webhook registry at `packages/backend/src/lib/webhook-registry.ts`. Current status:

```
Command: cat packages/backend/src/lib/webhook-registry.ts
```

| Status | Count | Webhooks |
|---|---|---|
| **live** (HTTP 200, data flows) | 11 | `gda-opp-tracker`, `gda-pipeline`, `gda-launchpad`, `gda-launchpad-funnel`, `gda-opportunity-detail`, `gda-deep-research-history`, `gda-capture-plan`, `gda-platform-health`, `gda-dashboard-mega`, `gda-trends`, `gda-daily-actions` |
| **exists** (n8n workflow exists, HTTP 500) | 20 | `gda-pwin-calculator`, `gda-incumbent-analysis`, `gda-competitor-field`, `gda-black-hat`, `gda-wargame`, `gda-semantic-search`, `gda-morning-briefing`, `gda-save-opp`, `gda-risk`, `gda-intel-feed`, `gda-report-builder`, `gda-compliance-matrix`, `gda-relationship-tracker`, `gda-discussions`, `gda-knowledge-base`, `gda-daily-brief`, `gda-predictive-intel`, `gda-competitor-watchlist`, `gda-competitor-threat-score`, `gda-contacts`, `gda-prompt-architect` |
| **planned** (no n8n workflow) | 8 | `gda-capture-intel-modules`, `gda-teaming-finder`, `gda-pwin-models`, `gda-pipeline-forecast`, `gda-bid-assessments`, `gda-win-loss-analysis`, `gda-anomalies`, `gda-escalation-rules`, `gda-escalations` |

**Total: 39 registered webhooks.**

### 5.2 n8n workflow → table access pattern

n8n workflows access GDA Postgres in two ways:

1. **Via HTTP API** (`/api/ingest/*`, `/api/n8n/:webhook`): Authenticated with `x-gda-key` header. Data flows through Express routes into the canonical schema.
2. **Via direct DB connection**: n8n has its own `N8N_DATABASE_URL` credential configured. Workflows can execute arbitrary SQL against the GDA database. The 63 `gda_*` shadow tables (Section 3.2) were created to hold this data.

**`UNVERIFIED — needs n8n admin access`**: Cannot enumerate individual n8n workflow configurations, last-run dates, or which specific tables each workflow touches without access to https://n8n.csr-llc.tech.

### 5.3 Webhook endpoints exposed by GDA backend that n8n calls

| Endpoint | Auth | Called by n8n for |
|---|---|---|
| `POST /api/ingest/opportunities` | `x-gda-key` | SAM.gov opportunity upserts |
| `POST /api/ingest/fpds` | `x-gda-key` | FPDS award ingestion |
| `POST /api/ingest/intel` | `x-gda-key` | Intel item ingestion |
| `POST /api/ingest/sam-opportunities` | `x-gda-key` | SAM opportunity records |
| `POST /api/ingest/competitor-movements` | `x-gda-key` | Competitor movement data |
| `POST /api/ingest/govtribe` | `x-gda-key` | GovTribe data push |
| `POST /api/ingest/govwin` | `x-gda-key` | GovWin data push |
| `POST /api/internal/vector-upsert` | `x-gda-key` | Vector embedding writes |
| `POST /api/internal/vector-delete` | `x-gda-key` | Vector embedding deletes |

### 5.4 Webhook endpoints exposed by n8n that GDA backend calls

| Webhook path | n8n workflow | Called by route |
|---|---|---|
| `gda-opp-tracker` | `GDA.api.opp-tracker 2` | `opportunities.ts` |
| `gda-pipeline` | `GDA.api.pipeline` | `opportunities.ts` |
| `gda-launchpad` | `GDA.api.launchpad` | `dashboard.ts` |
| `gda-launchpad-funnel` | `GDA.api.launchpad-funnel` | `dashboard.ts` |
| `gda-opportunity-detail` | `GDA.api.opportunity-detail` | `opportunities.ts` |
| `gda-deep-research-history` | `GDA.api.deep-research-history` | `intel.ts` |
| `gda-capture-plan` | `GDA.api.capture-plan` | `capture.ts` |
| `gda-platform-health` | `GDA.api.platform-health` | `qa.ts` |
| `gda-dashboard-mega` | `GDA.api.dashboard-mega` | `dashboard.ts` |
| `gda-trends` | `GDA.api.trends` | `dashboard.ts` |
| `gda-daily-actions` | `GDA.api.daily-actions` | `dashboard.ts` |

Plus the `POST /api/n8n/:webhook` generic proxy that forwards any frontend request to the named n8n webhook.

---

## Section 6 — Dead code / dead schema

### 6.1 Tables NOT referenced by any file in `packages/backend/src/routes/`

```
Command: for table in $(psql ... -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public'"); do
  count=$(grep -rl "$table" packages/backend/src/routes/ --include="*.ts" | wc -l)
  if [ "$count" -eq 0 ]; then echo "UNREFERENCED: $table"; fi
done
```

**77 tables** are not referenced by any route file. These fall into three categories:

1. **n8n shadow tables (63):** All `gda_*` prefixed tables from migrations 057–120 (see Section 3.2). These are accessed only by n8n workflows via direct DB connections.
2. **Legacy tables with webhook-only access (7):** `deep_research_reports`, `capture_coach_results`, `daily_trends`, `opportunity_alerts`, `document_embeddings`, `email_log`, `fix_proposals`. These are written/read by n8n webhooks or agent code, not Express routes.
3. **Unused legacy tables (7):** `bid_assessments`, `pipeline_forecasts`, `pwin_models`, `win_loss_analyses`, `knowledge_chat_sessions`, `opportunities_legacy`, `govtribe_credit_ledger`. These have schemas but no active code path (route or agent) references them.

### 6.2 Columns referenced in route code that do NOT exist in prod schema

**`UNVERIFIED — needs prod DB access`**: This cross-reference requires querying actual prod column names against route code column references. On dev (migration-derived schema), no mismatches were detected — the Sprint 2/3 migrations (129, 130) created all columns referenced by the new route files (`opportunities-v2.ts`, `pipeline-v2.ts`, `partner-intel.ts`, `captures.ts`, `action-items.ts`).

Potential risk area: The `opportunities.ts` legacy route references columns from both `opportunities_legacy` and the new `opportunities` table, using different schemas. The code routes through n8n webhooks for most reads, so column mismatches would surface as n8n SQL errors rather than Express route errors.

### 6.3 Columns in prod schema that are NOT referenced by any route code

Due to the 63 shadow tables having no route references at all, **every column in those 63 tables** is unreferenced from route code. Additionally, many columns in the legacy tables (e.g., `opportunities_legacy.capture_stage`, `opportunities_legacy.qualified_by`, etc.) are no longer referenced after the Sprint 2/3 refactor.

Full column-level dead analysis requires prod column introspection. **`UNVERIFIED — needs prod DB access`**.

### 6.4 Migrations marked DROP or _legacy_

| Migration | Contains DROP/legacy pattern | Detail |
|---|---|---|
| `027_remove_mock_data.sql` | DELETE statements | Removes seeded mock data, not schema drops |
| `028_fix_mock_data_patterns.sql` | DELETE statements | Additional mock data cleanup |
| `043_fix_duplicate_triggers.sql` | DROP TRIGGER | Removes duplicate versioning triggers (BROKEN-001) |
| `047_gov_source_deprecation.sql` | UPDATE ... deprecated_at | Marks gov source feeds as deprecated (soft deprecation) |
| `048_cleanup_fake_dibbs_records.sql` | DELETE | Removes fake DIBBS records |
| `129_sprint2_opps_pipeline_partner_intel.sql` | `RENAME TO opportunities_legacy` | Renames original `opportunities` to `_legacy` |

No migration contains `DROP TABLE`. The `opportunities_legacy` rename in 129 is the only `_legacy_` pattern.

### 6.5 Files in `.env.bak.*` form on the VPS

**`BLOCKED — needs prod VPS access`**: SSH to both `HOSTINGER_VPS_IP` and `100.100.80.78` timed out. Cannot list `.env.bak.*` files on the production VPS.

---

## Section 7 — R1 / R2 readiness

### 7.1 Source columns per table

| Table | Has `source_url` or `source_kind` columns? | R1 status |
|---|---|---|
| `opportunities` (Sprint 2) | `source` column (text, not typed) | Partial — has source but no `source_kind`/`source_url` per R1 spec |
| `opportunities_legacy` | `raw_source_url`, `data_source` | Partial — URL present, no typed `source_kind` |
| `pipeline_items` | `win_prob_evidence` (text) | Partial — evidence but no structured source citation |
| `captures` | No source columns | No |
| `action_items` | `source` (enum: email/manual/sentinel/launchpad), `source_id` | Partial — source type but no URL |
| `intel_items` | `source_url` | Yes |
| `launchpad_flags` | `source_url`, `doctrine_anchor` | Yes |
| `partner_intel_profiles` | No source columns (JSONB certs/vehicles) | No |
| `teaming_flags` | No source columns | No |
| `partner_awards` | No source columns | No |
| `partner_news_items` | No source columns | No |
| `source_registry` | `base_url`, `auth_method` | Yes (meta-source) |
| `gda_opportunity_tracker` | `source_url` | Yes |
| `gda_opportunity_alerts` / `opportunity_alerts` | `source_url` | Yes |
| `gda_idiq_tracker` | `source_url` | Yes |
| `gda_doc_inbox` | `source_url` | Yes |
| `ft_opportunity_signal` | `source_url` | Yes |
| `mergers_acquisitions` | `source_url` | Yes |

**R1 compliance at the API layer**: The `packages/backend/src/routes/opportunities/analysis.ts` file implements a `SourceRef` interface (`kind`, `title`, `url`, `retrieved_at`) and the `fetchSourcesForOpportunity` query helper. Per `docs/canonical/product_rules.md`, R1 is implemented on:

- OpportunityDetail: Yes (PR #379, F-104)
- Pipeline: Yes (PR #381, F-105)
- Capture: Yes (PR #381, F-105)
- Partner Intel: Yes (PR #381, F-105)
- Action Items: Yes (PR #381, F-105)
- Launchpad: Pending
- Settings: Pending

### 7.2 Auto-analysis on open (R2)

Per `docs/canonical/product_rules.md`, R2 requires analysis to auto-trigger on opportunity detail open.

| Detail endpoint | Auto-runs analysis on open? | Status |
|---|---|---|
| `GET /api/opportunities/:id` (legacy) | Routes through n8n `gda-opportunity-detail` webhook | Yes — n8n triggers analysis pipeline |
| `POST /api/opportunities/:id/analyze` | Explicit trigger for OODA analysis modules | Yes — called by frontend on detail open (F-104) |
| `GET /api/opportunities-v2/:id` | Returns Sprint 2 opportunity data | Partial — data fetch only, no auto-analysis trigger yet |

### 7.3 Gap list for V3

1. **Structured `SourceRef` columns on all tables**: Many tables lack typed `source_kind`/`source_url` columns. V3 must add a universal source citation pattern.
2. **Launchpad R1 compliance**: Pending per `product_rules.md`.
3. **Sprint 2 `opportunities` table**: No auto-analysis trigger on detail open (R2). The legacy path through n8n webhooks has it; the new Sprint 2 path does not.
4. **Partner Intel source citations**: `partner_intel_profiles`, `teaming_flags`, `partner_awards`, `partner_news_items` have no source columns in the schema (data is in JSONB blobs).
5. **Shadow table source coverage**: The 63 n8n shadow tables have inconsistent source tracking. Some (`gda_opportunity_tracker`, `gda_opportunity_alerts`) have `source_url`; most do not.

---

## Section 8 — Known issues already filed

### 8.1 Open GitHub issues referencing backend schema, migrations, or n8n

| # | Title | Last activity |
|---|---|---|
| #385 | F-200 — Phase 0 — Legacy Backend Audit (this issue) | 2026-05-29 |
| #258 | F-023 — Shadow Schema DDL | Status: addressed by migrations 057–120 |

**`UNVERIFIED`**: Full GitHub issue search requires API access. The issues above are referenced in the issue body.

### 8.2 Closed-but-incomplete issues

| # | Title | Status |
|---|---|---|
| F-035 (hardcoded data) | Had four waves of cleanup | **`UNVERIFIED`** — need to check if any hardcoded values remain in route code. Migrations 027 and 028 removed mock data from DB. |
| F-023 (shadow schema) | Shadow schema DDL | Migrations 057–120 formalized all shadow tables. Issue is addressed but the tables remain unreferenced by backend route code. |

### 8.3 Recent prod breaks

| Issue | Date | Root cause |
|---|---|---|
| F-107 (#382) | 2026-05-29 | The most recent commit on main is `hotfix(F-107): idempotent ALTER for Sprint 2/3 tables — restore ou_tag and missing columns`. Root cause: Sprint 2/3 migrations (129, 130) used `CREATE TABLE IF NOT EXISTS` but some tables already existed from legacy migrations with different column sets. The hotfix added `ADD COLUMN IF NOT EXISTS` guards. |

---

## Section 9 — Open questions for Phase 1

### 9.1 Decisions Phase 1 design must address

1. **Keep / drop / merge the 63 shadow tables?**
   - 63 `gda_*` tables are accessed only by n8n via direct DB. They duplicate concepts that exist in the canonical schema (e.g., `gda_action_items` vs. `action_items`, `gda_capture_plans` vs. `capture_plans`, `gda_contacts` vs. `contacts`).
   - Options: (a) migrate n8n workflows to use canonical tables and drop shadow tables, (b) merge shadow table data into canonical tables, (c) keep shadow tables as-is and build V3 only on canonical.

2. **`opportunities_legacy` vs. `opportunities` — migration path?**
   - The dual-table situation created by migration 129 is the single biggest schema debt. Many legacy tables (bid_recommendations, capture_plans, capture_gate_reviews, proposals, shred_jobs, merger_opp_impacts) FK to `opportunities_legacy`. The new Sprint 2 tables (pipeline_items, captures) FK to `opportunities`.
   - V3 must decide: (a) migrate all legacy FKs to the new table, (b) keep `opportunities_legacy` as a read-only archive, (c) merge both into a single V3 table.

3. **Data retention policy for legacy rows**
   - `opportunities_legacy` may contain prod data from n8n workflows that won't migrate cleanly to the Sprint 2 schema.
   - What is the retention policy? Archive to cold storage? Keep in a `_archive` table? Drop after migration validation?

4. **n8n workflow migration strategy**
   - 11 live webhooks, 20 "exists" webhooks, 8 "planned" webhooks. n8n is deeply embedded.
   - V3 must decide: (a) keep n8n as the workflow engine, (b) inline critical workflows into Express, (c) replace n8n entirely.

5. **pgvector vs. Pinecone**
   - Migration 125 (`vector_embeddings_dual_write`) shows a Pinecone→pgvector migration in progress. V3 must confirm: is Pinecone fully deprecated or still active?

6. **`gda_runtime` role deployment**
   - Migration 123 created the least-privilege `gda_runtime` role. **`UNVERIFIED`** whether it was bootstrapped on prod. V3 must confirm role architecture before designing new auth.

7. **Schema naming convention**
   - Three naming patterns coexist: `snake_case` (canonical), `gda_` prefix (n8n shadow), `step3b_gda_` / `step4b_gda_` prefix (batch shadow). V3 should standardize.

8. **Source citation schema**
   - R1 compliance is implemented at the API layer (SourceRef interface) but not consistently at the DB schema layer. V3 must decide: (a) add `source_kind`/`source_url` columns to every table, (b) use a separate `source_citations` junction table, (c) keep source citation as API-layer-only.
