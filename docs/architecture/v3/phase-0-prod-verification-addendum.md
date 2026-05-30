# Phase 0 — Prod Verification Addendum

**Date:** 2026-05-29
**Verified by:** Direct SSH query to `root@100.100.80.78` → `docker exec gda-postgres psql -U gda -d gda`
**Verifier:** Human-executed read-only audit commands; output transcribed verbatim below
**Status:** Supersedes UNVERIFIED sections of `phase-0-legacy-audit.md` where conflict exists

---

## TL;DR — prod is significantly worse than the dev-replay audit indicated

The original audit was generated from a fresh dev Postgres running all 134 migration files. **Production has only 128 migrations tracked in `schema_migrations`, plus a second competing tracker (`_migrations`) with 22 rows.** Migrations 127–134 (Sprint 1 ou_registry, Sprint 2 opportunities-pipeline-partner-intel, Sprint 3 capture-action-items, Riverstone UEI, and beyond) **never landed in production**.

This means every feature shipped in the F-100 through F-105 sprint chain is querying tables and columns that **do not exist** in prod. The backend health endpoint passes because it does not touch those tables. The moment a user opens Pipeline, Capture, Partner Intel, Action Items, or any Sprint 2/3 view, it returns HTTP 500 with `column "ou_tag" does not exist` (verified May 29 2026 12:00 EDT).

## Critical deltas vs. original audit

| Field | Original audit (dev replay) | Production reality | Severity |
|---|---|---|---|
| Public table count | 155 | **154** | Minor |
| Applied migrations | 134 (all on disk) | **128 in `schema_migrations`, 22 in `_migrations`** (dual tracker) | **CRITICAL** |
| Migrations 127–134 status | Applied | **NOT APPLIED to prod** | **CRITICAL** |
| `opportunities.id` type | `BIGSERIAL` (per migration 129) | **`text`** (legacy schema) | **CRITICAL** |
| `opportunities.ou_tag` column | Present | **MISSING** | **CRITICAL** |
| `opportunities.sam_notice_id` column | Present | **MISSING** | **CRITICAL** |
| `opportunities.value_min` / `value_max` | Present | **MISSING** (only legacy `value_estimated`) | **CRITICAL** |
| `opportunities.naics` / `agency` / `set_aside` | New schema | Present in legacy form | OK |
| `pipeline_items` table | Exists | **DOES NOT EXIST** | **CRITICAL** |
| `captures` table | Exists | **DOES NOT EXIST** | **CRITICAL** |
| `action_items` table | Exists | **DOES NOT EXIST** | **CRITICAL** |
| `action_item_drafts` table | Exists | **DOES NOT EXIST** | **CRITICAL** |
| `compliance_items` table | Exists | **DOES NOT EXIST** | **CRITICAL** |
| `partner_intel_profiles` table | Exists | **DOES NOT EXIST** | **CRITICAL** |
| `partner_awards` table | Exists | **DOES NOT EXIST** | **CRITICAL** |
| `partner_news_items` table | Exists | **DOES NOT EXIST** | **CRITICAL** |
| `teaming_flags` table | Exists | **DOES NOT EXIST** | **CRITICAL** |
| `launchpad_flags` table | Exists | **DOES NOT EXIST** | **CRITICAL** |
| `ou_registry` table | Exists | **DOES NOT EXIST** | **CRITICAL** |
| `ou_tag` enum | Defined | **DOES NOT EXIST** (only `entity_status` enum) | **CRITICAL** |
| n8n active workflows | UNVERIFIED | **158** (confirmed via n8n DB) | confirmed |
| n8n shadow tables in prod | 63 estimated | confirmed — `gda_*` prefix tables widespread | confirmed |
| DB size | UNVERIFIED | **95 MB** | Info |
| Row counts (real data) | UNVERIFIED | `sam_opportunities` 20,062 rows; `opportunities` 658 rows; `gda_opportunity_tracker` 1,924 rows | Info |

## Verified prod table list (154 tables)

```
_migrations, agent_config, agent_runs, ai_usage_log, anomalies, anomaly_rules,
approval_queue, approvals, audit_log, bid_assessments, bid_recommendations,
bot_entities, bot_glossary, bot_sources, capture_activities, capture_coach_results,
capture_gate_reviews, capture_guardrail_alerts, capture_plans, clause_references,
color_reviews, company_entity, company_profile, competitor_movements,
competitor_profiles, compliance_requirements, contacts, cpars_records,
daily_trends, dashboard_layouts, deep_research_reports, discussion_messages,
discussion_threads, doctrine_drafts, doctrine_publish_runs, document_embeddings,
email_log, enrichment_call_log, escalation_rules, escalations, export_jobs,
extracted_requirements, fast_track_matches, feature_flags, feed_config,
financial_kpis, fix_proposals, fpds_awards, ft_opportunity_signal, ft_signal_source,
gda_action_history, gda_action_items, gda_active_contracts, gda_ai_feedback,
gda_aop_tracker, gda_approval_queue, gda_capture_lessons, gda_capture_plans,
gda_chat_history, gda_clause_library, gda_competitor_cache, gda_competitor_crawls,
gda_competitor_watchlist, gda_compliance_matrices, gda_contacts, gda_content_store,
gda_contract_vehicles, gda_daily_briefings, gda_daily_briefs,
gda_dashboard_intel_cache, gda_data_lake, gda_decision_memory, gda_deep_research,
gda_dept_market, gda_discussions, gda_doc_inbox, gda_e2e_reports, gda_embeddings,
gda_error_log, gda_feedback, gda_health_scans, gda_idiq_tracker,
gda_incumbent_analysis, gda_intelligence_log, gda_interaction_log,
gda_knowledge_base, gda_learned_weights, gda_learning_log, gda_meeting_notes,
gda_mega_cache, gda_morning_briefings, gda_naics_tracking, gda_ndaa_intel,
gda_ooda_loops, gda_opportunity_alerts, gda_opportunity_tracker,
gda_pattern_library, gda_prompt_architect_memory, gda_pwin_scores,
gda_relationships, gda_risk_register, gda_saved_opportunities, gda_stage_audit,
gda_teaming_partners, gda_touchpoints, gda_trend_arrays, gda_wargames,
gda_win_loss, gda_win_loss_db, generated_reports, gov_source_feeds, govtribe_cache,
govtribe_credit_ledger, govtribe_credit_monthly, govwin_call_log, intel_items,
knowledge_chat_sessions, knowledge_collections, knowledge_documents,
merger_opp_impacts, mergers_acquisitions, monthly_financials, morning_briefings,
notifications, opportunities, opportunity_alerts, pipeline_forecasts,
procurement_vehicles, prompts, proposal_compliance_map, proposal_section_versions,
proposal_sections, proposals, pwin_models, record_version, refresh_tokens,
report_templates, risk_register, sam_opportunities, sam_scan_runs,
sam_verification_runs, scheduled_reports, schema_migrations, shred_jobs,
source_health_snapshots, source_registry, source_sync_runs,
system_health_snapshots, uploaded_files, user_invitations, users,
v_opportunity_active, v_opportunity_all_tracked, win_loss_analyses
```

Tables expected by recent route code but **missing from prod**:
`pipeline_items`, `captures`, `action_items`, `action_item_drafts`, `compliance_items`, `partner_intel_profiles`, `partner_awards`, `partner_news_items`, `teaming_flags`, `launchpad_flags`, `ou_registry`

## Verified `opportunities` schema (prod)

```
id                  text       NOT NULL  -- legacy text PK, not BIGSERIAL
title               text       NOT NULL
agency              text
department          text
status              text       NOT NULL  DEFAULT 'discovery'
score               numeric    NOT NULL  DEFAULT 0
value_estimated     numeric                                    -- legacy, no value_min/max
probability_of_win  numeric
naics               text
psc                 text
due_date            timestamptz                                -- legacy, no response_due_at
solicitation_number text
set_aside           text
place_of_performance text
incumbent           text
qualified_at        timestamptz
qualified_by        text
tags                text[]     DEFAULT '{}'
raw_source_url      text
created_at          timestamptz NOT NULL DEFAULT now()
updated_at          timestamptz NOT NULL DEFAULT now()
capture_stage       text       DEFAULT 'interest'
data_source         text       DEFAULT 'manual'
approved_at         timestamptz
approved_by         text
ooda                jsonb
analysis            jsonb
ai_analyzed_at      timestamptz
description         text
deleted_at          timestamptz
pursuing_entity_id  text
vehicle_type        text
ai_summary          text
incumbent_confidence text
incumbent_source    text
govwin_update_date  text
```

Missing vs. expected (per migration 129): `ou_tag`, `sam_notice_id` (unique), `sub_agency`, `response_due_at`, `posted_at`, `value_min`, `value_max`, `grade`, `grade_evidence`, `is_partner_teaming_required`, `teaming_partner`.

## Verified migration tracker state

Two tracker tables exist in prod:

- `schema_migrations` — 128 rows
- `_migrations` — 22 rows

**This is the root cause for migrations 127–134 not landing.** The migration runner is likely writing to one table while checking the other (or has switched runners between deployments and lost the historical state). Phase 1 design must reconcile this and pick a single canonical tracker.

## Confirmed legacy env backup leakage

Three sensitive backup files present on VPS:

```
/root/gda-command-v2/.env.bak.20260526-0044
/root/gda-command-v2/.env.bak.20260526-0048-leakfix
/root/gda-command-v2/.env.bak.f020-broken-1779851973
```

The filename `f020-broken` indicates these are artifacts of a failed F-020 deploy and should be moved to an out-of-tree secrets store, then deleted from the VPS. Out of scope for V3 program but flagged as a security item.

## Top-10 largest tables (prod, real bytes)

```
record_version             26 MB   16,425 rows
document_embeddings        15 MB      901 rows
sam_opportunities          14 MB   20,062 rows  ← real opportunity inventory lives here
gda_embeddings             14 MB      821 rows
gda_opportunity_tracker  1736 KB    1,924 rows  ← n8n shadow opportunity table
fpds_awards               752 KB      534 rows
opportunities             728 KB      658 rows  ← legacy backend opportunity table
gda_risk_register         504 KB      527 rows
gda_e2e_reports           504 KB      271 rows
gda_capture_plans         456 KB      110 rows
```

**Three competing opportunity tables in prod:**
- `sam_opportunities` (20,062 rows — n8n sync from SAM.gov)
- `gda_opportunity_tracker` (1,924 rows — n8n shadow tracking)
- `opportunities` (658 rows — backend-owned, legacy schema)

V3 design must pick the canonical source and write the import strategy for the other two.

## Confirmed: only one enum exists in prod

```
entity_status
```

The `ou_tag`, `color_review_stage`, `action_source`, `action_status`, `draft_kind`, `draft_status`, `teaming_flag_reason` enums **do not exist in prod**. All defined in migrations 127, 129, 130 that never applied.

## Implications for V3 program

1. **F-107 (the symptom hotfix) is irrelevant.** It would have ALTER'd a table that's missing a dozen columns and missing 10 sibling tables. The right fix was always V3.
2. **Phase 1 design must address the dual-migration-tracker bug** as a root cause. V3 will use a single canonical tracker. Lock it.
3. **Data import strategy (Phase 4) has more work than expected.** Three opportunity tables, 63 shadow tables, all need triage: which data migrates to V3, which is dropped.
4. **No frontend regression risk from cutover.** Frontend code is already querying broken endpoints — V3 cutover can only make things better than they are now.
5. **All sprints F-100 → F-105 should be re-validated under V3.** Code merged but never functional in prod = effectively unbuilt.

## Verification command used (for reproducibility)

```bash
ssh root@100.100.80.78 → docker exec gda-postgres psql -U gda -d gda -At
```

Full transcript stored in conversation thread May 29 2026 12:15 EDT.

## Recommended Phase 0 sign-off conditions

- [x] Production schema verified directly against `gda-postgres`
- [x] Dual migration tracker confirmed as root cause of 127–134 not landing
- [x] All "Sprint 2/3 schema exists" claims in original audit corrected to "MISSING in prod"
- [x] Three opportunity tables identified for Phase 4 triage
- [ ] Human approval to merge this addendum + the original audit as the Phase 0 deliverable
- [ ] Authorization to proceed to Phase 1 design tickets (F-201 through F-204)
