# Phase 1 — V3 Data Migration Strategy

**Program:** Backend V3 rebuild — F-V3-PROGRAM tracker (#384)
**Phase:** 1 — Design
**Date:** 2026-05-29
**Author:** Devin (automated)
**Status:** Draft — awaiting human sign-off before Phase 2 code
**Inputs:** `phase-0-legacy-audit.md`, `phase-0-prod-verification-addendum.md`, `phase-0-scope-correction.md`
**Binding scope:** Envision-only (see scope correction). No Riverstone- or PD-Systems-owned data migrates.

---

## 1. Source-of-truth decisions

### 1.1 Opportunities

**Three competing tables in prod:**

| Table | Rows | PK type | Source | Key columns |
|---|---|---|---|---|
| `sam_opportunities` | 20,062 | BIGSERIAL | n8n SAM.gov sync | `notice_id`, `solicitation_number`, `title`, `agency`, `posted_date`, `response_deadline`, `naics`, `set_aside`, `value` |
| `gda_opportunity_tracker` | 1,924 | BIGSERIAL | n8n shadow workflows | `title`, `agency`, `status`, `source_url`, `value_estimated`, `naics` |
| `opportunities` | 658 | text | Legacy backend | `title`, `agency`, `status`, `value_estimated`, `raw_source_url`, `solicitation_number`, `data_source` |

**Canonical source decision: `sam_opportunities`** is the canonical feed.

Reasoning:
1. `sam_opportunities` holds 20,062 rows — 10× more coverage than the other two tables combined. It is the real opportunity inventory synced from SAM.gov via n8n.
2. `sam_opportunities` has a `notice_id` column that serves as a natural deduplication key against the federal source of truth.
3. `opportunities` (658 rows, text PK) is the legacy backend table — rows were manually entered or ingested from SAM/GovTribe but lack structured provenance. It is the historical working table but has no unique federal identifier beyond `solicitation_number`.
4. `gda_opportunity_tracker` (1,924 rows) is an n8n shadow table used for workflow tracking. Many rows overlap with `sam_opportunities` but may contain Envision-specific enrichment (`status`, `pwin`, `capture_stage`) that `sam_opportunities` lacks.

**Merge strategy:**

1. Start with `sam_opportunities` as the base feed — each row becomes a V3 `opportunities` record.
2. For each `gda_opportunity_tracker` row, match by `solicitation_number` or `title` + `agency` fuzzy match against `sam_opportunities`. If matched, merge Envision-specific enrichment fields (`status`, `pwin`, `capture_stage`, `source_url`) into the corresponding V3 record. If unmatched, import as a standalone V3 opportunity with `source_kind = 'n8n_tracker'`.
3. For each `opportunities` (legacy) row, match by `solicitation_number` against the V3 table. If matched, merge legacy enrichment fields (`ooda`, `analysis`, `capture_stage`, `qualified_at`, `qualified_by`). If unmatched, import as a standalone V3 opportunity with `source_kind = 'legacy_manual'`.
4. Deduplication key: `solicitation_number` (primary), falling back to `title + agency` fuzzy match (Levenshtein threshold ≥ 0.85).
5. Conflict resolution: SAM.gov values win for federal fields (title, agency, NAICS, value, dates). Envision enrichment fields (status, pwin, capture_stage, analysis) are preserved from whichever legacy source has the most recent `updated_at`.

### 1.2 Captures

**Two competing tables in prod:**

| Table | Rows | Source |
|---|---|---|
| `gda_capture_plans` | 110 | n8n shadow workflows |
| `capture_plans` | 0 (seed only in dev) | Legacy backend (migration 001) |

**Canonical source: `gda_capture_plans`** — it has the actual prod data (110 rows). `capture_plans` is structurally present but empty in prod.

Supporting tables:
- `capture_activities` — FK to `capture_plans.id` (legacy). If `capture_plans` has 0 prod rows, this is also empty. **DROP.**
- `capture_gate_reviews` — FK to `opportunities_legacy.id`. Contains gate review data. **TRANSFORM** — re-link to V3 opportunity IDs.
- `capture_guardrail_alerts` — FK to `opportunities_legacy.id`. **TRANSFORM** — re-link.
- `capture_coach_results` — standalone AI output. **KEEP** as reference data.
- `gda_capture_lessons` — n8n capture lessons. **KEEP** — migrate as reference data.
- `gda_compliance_matrices` — n8n compliance matrices. **KEEP** — closest to V3 compliance items concept.

### 1.3 Action items

**Two competing tables in prod:**

| Table | Rows | Source |
|---|---|---|
| `gda_action_items` | present (n8n shadow) | n8n workflows |
| `gda_action_history` | present (n8n shadow) | n8n action audit trail |

The Sprint 3 `action_items` and `action_item_drafts` tables (migration 130) **do not exist in prod**.

**Canonical source: `gda_action_items`** — the only table with actual action item data in prod. `gda_action_history` provides audit trail and should migrate as historical reference.

### 1.4 Sources

**Current state:** Source attribution is scattered across multiple patterns:
- `source_registry` (9 rows) — meta-registry of data sources (SAM, GovTribe, GovWin, etc.)
- `raw_source_url` column on `opportunities` (legacy)
- `source_url` column on `gda_opportunity_tracker`, `gda_opportunity_alerts`, `gda_idiq_tracker`, `gda_doc_inbox`, `ft_opportunity_signal`, `mergers_acquisitions`
- `source` column on Sprint 2 `opportunities` (dev only — does not exist in prod)
- R1 `SourceRef` interface at the API layer (`kind`, `title`, `url`, `retrieved_at`)

**Canonical source for V3: `source_registry`** as the reference table defining known source systems. Individual source citations derive from:
1. `raw_source_url` on legacy `opportunities` — backfill `source_kind` from URL pattern matching (sam.gov → `sam_gov`, govtribe → `govtribe`, etc.)
2. `source_url` on `gda_opportunity_tracker` — same backfill
3. For rows with no URL: `source_kind = 'legacy_unknown'`, `source_url = NULL`

### 1.5 Partners

Per scope correction: partners are **not OUs**. No partner-as-OU data migrates.

**Data source for teaming enrichment:**
- `gda_teaming_partners` — n8n shadow table with teaming partner records. **KEEP** — becomes the seed for the V3 `teaming_attachments` lookup table (read-only partner facts referenced from opportunities).
- `gda_relationships` + `gda_touchpoints` — CRM-style relationship tracking. **TRANSFORM** — extract Envision-relevant relationship data only.

**Explicitly dropped:**
- `partner_intel_profiles` — does not exist in prod (migration 129 never applied). No data to migrate.
- `partner_awards` — does not exist in prod. No data to migrate.
- `partner_news_items` — does not exist in prod. No data to migrate.
- `ou_registry` — does not exist in prod. No data to migrate.

---

## 2. Per-table disposition (all 154 prod tables)

Every table verified in prod is listed below. Disposition codes:
- **KEEP** — migrate as-is to V3 (possibly with column renames)
- **TRANSFORM** — migrate with structural changes (re-key, merge, filter)
- **DROP** — do not migrate; data is obsolete, empty, or out of scope
- **DECIDE** — requires human triage before migration

| # | legacy_table | row_count | disposition | maps_to_v3_table | filter_rules | notes |
|---|---|---|---|---|---|---|
| 1 | `_migrations` | 22 | DROP | — | — | Shadow migration tracker; V3 uses single canonical `schema_migrations`. Reconcile history then drop. |
| 2 | `agent_config` | 6 | KEEP | `agent_config` | All rows | Agent definitions; Envision-owned |
| 3 | `agent_runs` | low | KEEP | `agent_runs` | All rows | Agent execution history |
| 4 | `ai_usage_log` | low | KEEP | `ai_usage_log` | All rows | LLM usage tracking for cost control |
| 5 | `anomalies` | 0 | DROP | — | — | No prod data |
| 6 | `anomaly_rules` | 5 | KEEP | `anomaly_rules` | All rows | Seed anomaly detection rules |
| 7 | `approval_queue` | low | KEEP | `approval_queue` | All rows | Agent approval queue |
| 8 | `approvals` | low | KEEP | `approvals` | All rows | Approval records |
| 9 | `audit_log` | varies | KEEP | `audit_log` | All rows | Audit trail; import last (dependency: `users`) |
| 10 | `bid_assessments` | 0 | DROP | — | — | Predictive module, no route code, no prod data |
| 11 | `bid_recommendations` | low | TRANSFORM | `bid_recommendations` | All rows | FK to `opportunities_legacy.id` → re-key to V3 `opportunities.id` via `legacy_id` lookup |
| 12 | `bot_entities` | 27 | KEEP | `bot_entities` | All rows | Book of Truths reference data |
| 13 | `bot_glossary` | 23 | KEEP | `bot_glossary` | All rows | Book of Truths reference data |
| 14 | `bot_sources` | 15 | KEEP | `bot_sources` | All rows | Book of Truths reference data |
| 15 | `capture_activities` | 0 | DROP | — | — | FK to `capture_plans.id`; `capture_plans` has 0 prod rows → this is empty |
| 16 | `capture_coach_results` | low | KEEP | `capture_coach_results` | All rows | AI capture coach output; standalone (no FK issues) |
| 17 | `capture_gate_reviews` | low | TRANSFORM | `capture_gate_reviews` | All rows | FK to `opportunities.id` (legacy text PK) → re-key to V3 opportunity ID |
| 18 | `capture_guardrail_alerts` | low | TRANSFORM | `capture_guardrail_alerts` | All rows | FK to `opportunities.id` (legacy text PK) → re-key to V3 opportunity ID |
| 19 | `capture_plans` | 0 | DROP | — | — | Empty in prod; `gda_capture_plans` is canonical |
| 20 | `clause_references` | low | KEEP | `clause_references` | All rows | Contract clause references |
| 21 | `color_reviews` | low | KEEP | `color_reviews` | All rows | Proposal color review records |
| 22 | `company_entity` | 4 | KEEP | `company_entity` | All rows | Entity merger tracking (Envision + GDA context) |
| 23 | `company_profile` | 1 | KEEP | `company_profile` | All rows | Envision company profile |
| 24 | `competitor_movements` | low | KEEP | `competitor_movements` | All rows | Competitor intelligence |
| 25 | `competitor_profiles` | low | KEEP | `competitor_profiles` | All rows | Competitor profiles |
| 26 | `compliance_requirements` | low | KEEP | `compliance_requirements` | All rows | Compliance requirements library |
| 27 | `contacts` | low | KEEP | `contacts` | All rows | Contact directory (Envision contacts) |
| 28 | `cpars_records` | low | KEEP | `cpars_records` | All rows | CPAR performance records |
| 29 | `daily_trends` | low | DROP | — | — | n8n shadow; cache data, not source of truth. Regenerate in V3. |
| 30 | `dashboard_layouts` | low | DROP | — | — | User dashboard customization; V3 redesigns dashboards |
| 31 | `deep_research_reports` | low | KEEP | `deep_research_reports` | All rows | Deep research output; valuable institutional knowledge |
| 32 | `discussion_messages` | low | KEEP | `discussion_messages` | All rows | Discussion thread messages (FK: `discussion_threads`) |
| 33 | `discussion_threads` | low | KEEP | `discussion_threads` | All rows | Discussion threads |
| 34 | `doctrine_drafts` | low | KEEP | `doctrine_drafts` | All rows | Doctrine version history |
| 35 | `doctrine_publish_runs` | low | KEEP | `doctrine_publish_runs` | All rows | Doctrine publish audit |
| 36 | `document_embeddings` | 901 | TRANSFORM | `document_embeddings` | All rows | pgvector embeddings; re-index after V3 schema change. Keep collection + metadata columns from migration 125. |
| 37 | `email_log` | low | KEEP | `email_log` | All rows | Email send history (FK: `notifications`, `users`) |
| 38 | `enrichment_call_log` | low | KEEP | `enrichment_call_log` | All rows | AI enrichment call tracking |
| 39 | `escalation_rules` | 8 | KEEP | `escalation_rules` | All rows | Escalation rule definitions |
| 40 | `escalations` | low | KEEP | `escalations` | All rows | Escalation records (FK: `escalation_rules`) |
| 41 | `export_jobs` | low | DROP | — | — | Transient export state; not worth migrating |
| 42 | `extracted_requirements` | low | KEEP | `extracted_requirements` | All rows | RFP shredder output (FK: `shred_jobs`) |
| 43 | `fast_track_matches` | low | KEEP | `fast_track_matches` | All rows | Fast Track tech lead matches |
| 44 | `feature_flags` | 9 | TRANSFORM | `feature_flags` | All rows | Re-seed V3 flags; legacy flag values may not apply |
| 45 | `feed_config` | low | KEEP | `feed_config` | All rows | Feed configuration |
| 46 | `financial_kpis` | 16 | KEEP | `financial_kpis` | All rows | Envision financial KPIs |
| 47 | `fix_proposals` | low | KEEP | `fix_proposals` | All rows | Controlled Fix agent proposals (FK: `agent_runs`) |
| 48 | `fpds_awards` | 534 | KEEP | `fpds_awards` | All rows | FPDS award data; federal source of truth |
| 49 | `ft_opportunity_signal` | low | KEEP | `ft_opportunity_signal` | All rows | Fast Track signals (FK: `ft_signal_source`) |
| 50 | `ft_signal_source` | low | KEEP | `ft_signal_source` | All rows | Fast Track signal source definitions |
| 51 | `gda_action_history` | varies | TRANSFORM | `action_item_history` | Envision rows only | n8n action audit trail → V3 action item history. Filter: rows where owner is Envision staff. |
| 52 | `gda_action_items` | varies | TRANSFORM | `action_items` | Envision rows only | Canonical action items source → V3 `action_items`. Add `source_kind = 'n8n_legacy'`. |
| 53 | `gda_active_contracts` | varies | KEEP | `active_contracts` | All rows | Active contract tracking; Envision contracts |
| 54 | `gda_ai_feedback` | low | DROP | — | — | AI feedback loop; low-value, regenerable |
| 55 | `gda_aop_tracker` | low | KEEP | `aop_tracker` | All rows | Annual operating plan; Envision business data |
| 56 | `gda_approval_queue` | low | DROP | — | — | Parallel to canonical `approval_queue`; use canonical |
| 57 | `gda_capture_lessons` | low | KEEP | `capture_lessons` | All rows | Capture lessons learned; institutional knowledge |
| 58 | `gda_capture_plans` | 110 | TRANSFORM | `captures` | All rows | Canonical capture source → V3 `captures`. Re-key opportunity references. Add `source_kind`. |
| 59 | `gda_chat_history` | low | DROP | — | — | Transient chat state; not institutional knowledge |
| 60 | `gda_clause_library` | low | DECIDE | `clause_library` | — | May overlap with `clause_references`. Human triage: merge or keep separate? |
| 61 | `gda_competitor_cache` | low | DROP | — | — | Cache data; regenerable from source APIs |
| 62 | `gda_competitor_crawls` | low | DROP | — | — | Ephemeral crawl data; regenerable |
| 63 | `gda_competitor_watchlist` | low | KEEP | `competitor_watchlist` | All rows | Competitor watchlist configuration |
| 64 | `gda_compliance_matrices` | low | TRANSFORM | `compliance_items` | All rows | Compliance matrix data → V3 `compliance_items`. Re-key to V3 capture IDs. |
| 65 | `gda_contacts` | low | DECIDE | `contacts` | — | Parallel to canonical `contacts`. Human triage: merge (deduplicate by email) or prefer one source? |
| 66 | `gda_content_store` | low | DROP | — | — | Generic content blob; no structured value |
| 67 | `gda_contract_vehicles` | low | DECIDE | `procurement_vehicles` | — | May overlap with `procurement_vehicles`. Human triage: merge or keep separate? |
| 68 | `gda_daily_briefings` | low | DROP | — | — | Ephemeral briefing cache; regenerable |
| 69 | `gda_daily_briefs` | low | DROP | — | — | Ephemeral brief summaries; regenerable |
| 70 | `gda_dashboard_intel_cache` | low | DROP | — | — | Cache data; regenerable |
| 71 | `gda_data_lake` | low | DROP | — | — | Generic data lake blob; no structured schema |
| 72 | `gda_decision_memory` | low | KEEP | `decision_memory` | All rows | Decision memory (FK: `gda_opportunity_tracker` → re-key to V3 opp ID) |
| 73 | `gda_deep_research` | low | DECIDE | `deep_research_reports` | — | May overlap with `deep_research_reports`. Human triage: merge or deduplicate? |
| 74 | `gda_dept_market` | low | KEEP | `dept_market` | All rows | Department/market analysis data |
| 75 | `gda_discussions` | low | DECIDE | `discussion_threads` | — | Parallel to canonical `discussion_threads`. Human triage: merge or prefer one? |
| 76 | `gda_doc_inbox` | low | KEEP | `doc_inbox` | All rows | Document inbox; may contain un-processed items |
| 77 | `gda_e2e_reports` | 271 | KEEP | `e2e_reports` | All rows | End-to-end reports; institutional knowledge |
| 78 | `gda_embeddings` | 821 | DROP | — | — | Superseded by `document_embeddings` (pgvector migration). Will be re-indexed in V3. |
| 79 | `gda_error_log` | low | DROP | — | — | Ephemeral error logs; not worth migrating |
| 80 | `gda_feedback` | low | DROP | — | — | Low-value user feedback |
| 81 | `gda_health_scans` | low | DROP | — | — | Superseded by `system_health_snapshots` (Sentinel) |
| 82 | `gda_idiq_tracker` | low | KEEP | `idiq_tracker` | All rows | IDIQ tracking data; has `source_url` |
| 83 | `gda_incumbent_analysis` | low | KEEP | `incumbent_analysis` | All rows | Incumbent analysis data |
| 84 | `gda_intelligence_log` | low | KEEP | `intelligence_log` | All rows | Intelligence log entries |
| 85 | `gda_interaction_log` | low | DROP | — | — | Generic interaction log; low structured value |
| 86 | `gda_knowledge_base` | low | DECIDE | `knowledge_documents` | — | Parallel to canonical `knowledge_documents` / `knowledge_collections`. Human triage: merge or prefer canonical? |
| 87 | `gda_learned_weights` | low | DROP | — | — | ML model weights; regenerable from training |
| 88 | `gda_learning_log` | low | DROP | — | — | AI learning log; ephemeral |
| 89 | `gda_meeting_notes` | low | KEEP | `meeting_notes` | All rows | Meeting notes; institutional knowledge |
| 90 | `gda_mega_cache` | low | DROP | — | — | Dashboard mega cache; regenerable |
| 91 | `gda_morning_briefings` | low | DROP | — | — | Ephemeral briefing cache; regenerable |
| 92 | `gda_naics_tracking` | low | KEEP | `naics_tracking` | All rows | NAICS code tracking for Envision |
| 93 | `gda_ndaa_intel` | low | KEEP | `ndaa_intel` | All rows | NDAA legislative intelligence |
| 94 | `gda_ooda_loops` | low | KEEP | `ooda_loops` | All rows | OODA loop analysis history |
| 95 | `gda_opportunity_alerts` | low | TRANSFORM | `opportunity_alerts` | Envision rows only | Merge with canonical `opportunity_alerts` (table #127). Deduplicate by opportunity reference. |
| 96 | `gda_opportunity_tracker` | 1,924 | TRANSFORM | `opportunities` | Envision rows only | Merge into V3 `opportunities` per Section 1.1 merge strategy. Match by `solicitation_number`. |
| 97 | `gda_pattern_library` | low | KEEP | `pattern_library` | All rows | Proposal pattern library; institutional knowledge |
| 98 | `gda_prompt_architect_memory` | low | KEEP | `prompt_memory` | All rows | Prompt architect memory; institutional knowledge |
| 99 | `gda_pwin_scores` | low | KEEP | `pwin_scores` | All rows | Pwin score history |
| 100 | `gda_relationships` | low | TRANSFORM | `relationships` | Envision rows only | CRM relationships. Filter: only relationships where Envision is a party. |
| 101 | `gda_risk_register` | 527 | KEEP | `risk_register_items` | All rows | Risk register data (527 rows); merge with canonical `risk_register` |
| 102 | `gda_saved_opportunities` | low | TRANSFORM | — | Envision rows only | Saved/bookmarked opps → map to V3 opportunity IDs as user bookmarks |
| 103 | `gda_stage_audit` | low | KEEP | `stage_audit` | All rows | Stage transition audit history |
| 104 | `gda_teaming_partners` | low | KEEP | `teaming_attachments` | All rows | Teaming partner lookup data; seed for V3 teaming enrichment |
| 105 | `gda_touchpoints` | low | TRANSFORM | `touchpoints` | Envision rows only | Relationship touchpoints (FK: `gda_relationships`). Filter with parent. |
| 106 | `gda_trend_arrays` | low | DROP | — | — | Trend cache data; regenerable |
| 107 | `gda_wargames` | low | KEEP | `wargames` | All rows | War game scenario data |
| 108 | `gda_win_loss` | low | DECIDE | `win_loss` | — | Parallel to `gda_win_loss_db` and `win_loss_analyses`. Human triage: which is canonical? |
| 109 | `gda_win_loss_db` | low | DECIDE | `win_loss` | — | Parallel to `gda_win_loss`. Human triage: merge with above? |
| 110 | `generated_reports` | low | KEEP | `generated_reports` | All rows | Generated report output (FK: `report_templates`) |
| 111 | `gov_source_feeds` | 7 | KEEP | `gov_source_feeds` | All rows | Government source feed definitions |
| 112 | `govtribe_cache` | low | DROP | — | — | API response cache; regenerable |
| 113 | `govtribe_credit_ledger` | low | KEEP | `govtribe_credit_ledger` | All rows | GovTribe API credit tracking |
| 114 | `govtribe_credit_monthly` | low | KEEP | `govtribe_credit_monthly` | All rows | Monthly credit aggregation (prod-only shadow table) |
| 115 | `govwin_call_log` | low | KEEP | `govwin_call_log` | All rows | GovWin API call log |
| 116 | `intel_items` | low | KEEP | `intel_items` | All rows | Intelligence feed items |
| 117 | `knowledge_chat_sessions` | 0 | DROP | — | — | No prod data; no route code |
| 118 | `knowledge_collections` | 6 | KEEP | `knowledge_collections` | All rows | Knowledge base collection definitions |
| 119 | `knowledge_documents` | low | KEEP | `knowledge_documents` | All rows | Knowledge base documents (FK: `knowledge_collections`, `uploaded_files`) |
| 120 | `merger_opp_impacts` | low | TRANSFORM | `merger_opp_impacts` | All rows | FK to `opportunities.id` (legacy text PK) → re-key to V3 opp ID |
| 121 | `mergers_acquisitions` | 5 | KEEP | `mergers_acquisitions` | All rows | M&A tracking |
| 122 | `monthly_financials` | 3 | KEEP | `monthly_financials` | All rows | Monthly financial uploads (Gina's Excel files) |
| 123 | `morning_briefings` | low | DROP | — | — | Ephemeral briefing data; superseded by `gda_morning_briefings` (also dropped) |
| 124 | `notifications` | low | DROP | — | — | Transient notification state; V3 rebuilds notification system |
| 125 | `opportunities` | 658 | TRANSFORM | `opportunities` | All rows (Envision-owned) | Legacy backend opps → merge into V3 per Section 1.1. Text PK → BIGSERIAL. |
| 126 | `opportunity_alerts` | low | TRANSFORM | `opportunity_alerts` | All rows | Merge with `gda_opportunity_alerts` (#95). Deduplicate. |
| 127 | `pipeline_forecasts` | 0 | DROP | — | — | Monte Carlo forecast; no prod data, no route code |
| 128 | `procurement_vehicles` | 13 | KEEP | `procurement_vehicles` | All rows | Envision IDIQ/vehicle inventory |
| 129 | `prompts` | low | KEEP | `prompts` | All rows | Prompt library |
| 130 | `proposal_compliance_map` | low | KEEP | `proposal_compliance_map` | All rows | Proposal-to-compliance mapping (FK: `proposals`, `proposal_sections`) |
| 131 | `proposal_section_versions` | low | KEEP | `proposal_section_versions` | All rows | Proposal section version history (FK: `proposal_sections`) |
| 132 | `proposal_sections` | low | KEEP | `proposal_sections` | All rows | Proposal section definitions |
| 133 | `proposals` | low | TRANSFORM | `proposals` | All rows | FK to `opportunities.id` (legacy text PK) → re-key to V3 opp ID |
| 134 | `pwin_models` | 0 | DROP | — | — | ML model storage; no prod data, no route code |
| 135 | `record_version` | 16,425 | KEEP | `record_version` | All rows | Versioning/soft-delete audit table (26 MB). Import last. |
| 136 | `refresh_tokens` | low | DROP | — | — | Transient auth tokens; V3 issues new tokens |
| 137 | `report_templates` | low | KEEP | `report_templates` | All rows | Report template definitions |
| 138 | `risk_register` | low | TRANSFORM | `risk_register_items` | All rows | Merge with `gda_risk_register` (#101). Deduplicate by risk title/category. |
| 139 | `sam_opportunities` | 20,062 | TRANSFORM | `opportunities` | Envision-relevant only | Canonical opportunity feed → V3 `opportunities` per Section 1.1. Filter: only import rows where Envision is pursuing or row matches Envision NAICS/agency profile. Non-matching rows kept as reference data in a `sam_opportunities_archive` read-only table. |
| 140 | `sam_scan_runs` | low | KEEP | `sam_scan_runs` | All rows | SAM scan execution history |
| 141 | `sam_verification_runs` | low | KEEP | `sam_verification_runs` | All rows | SAM verification execution history |
| 142 | `scheduled_reports` | low | KEEP | `scheduled_reports` | All rows | Scheduled report configuration |
| 143 | `schema_migrations` | 128 | DROP | — | — | Legacy migration tracker. V3 starts fresh with its own `schema_migrations`. |
| 144 | `shred_jobs` | low | TRANSFORM | `shred_jobs` | All rows | RFP shredder jobs. FK to `opportunities.id` (legacy text PK) → re-key. |
| 145 | `source_health_snapshots` | low | KEEP | `source_health_snapshots` | All rows | Source health monitoring data |
| 146 | `source_registry` | 9 | KEEP | `source_registry` | All rows | Data source definitions |
| 147 | `source_sync_runs` | low | KEEP | `source_sync_runs` | All rows | Source sync execution history (FK: `source_registry`) |
| 148 | `system_health_snapshots` | low | KEEP | `system_health_snapshots` | All rows | Sentinel health snapshots |
| 149 | `uploaded_files` | low | KEEP | `uploaded_files` | All rows | File storage records |
| 150 | `user_invitations` | low | DROP | — | — | Transient invitation state; V3 re-invites |
| 151 | `users` | low | KEEP | `users` | All rows | User accounts (import early — many FKs depend on this) |
| 152 | `v_opportunity_active` | view | DROP | — | — | Prod-only view (no migration file); V3 defines its own views |
| 153 | `v_opportunity_all_tracked` | view | DROP | — | — | Prod-only view (no migration file); V3 defines its own views |
| 154 | `win_loss_analyses` | 0 | DROP | — | — | No prod data; no route code |

**Disposition summary:**

| Disposition | Count |
|---|---|
| KEEP | 74 |
| TRANSFORM | 22 |
| DROP | 49 |
| DECIDE | 9 |
| **Total** | **154** |

---

## 3. Filter rules (Envision-only)

### 3.1 Identifying Envision-owned rows

Per the scope correction, GDA Command is a single-tenant Envision tool. The following rules determine which rows in multi-source legacy tables are Envision-owned:

**Default rule:** All rows migrate unless explicitly excluded below.

**Exclusion patterns:**

| Pattern | How to detect | Action |
|---|---|---|
| Rows tagged for Riverstone as primary owner | `pursuing_entity_id` matching Riverstone entity (check `company_entity` for Riverstone UEI `TECGLUBFP6N6`) | DROP |
| Rows tagged for PD Systems as primary owner | `pursuing_entity_id` matching PD Systems entity | DROP |
| Rows with `data_source = 'partner_sync'` | Explicit partner data sync flag | DROP |
| Rows in `gda_teaming_partners` | These ARE the partner lookup records | KEEP (as teaming lookup, not as OU data) |
| Ambiguous rows (no clear owner) | No `pursuing_entity_id`, `data_source = 'manual'` or NULL | KEEP — default to Envision |

### 3.2 Per-table filter application

| Table | Filter logic |
|---|---|
| `opportunities` (legacy, 658 rows) | Keep all — `pursuing_entity_id` values must be checked. Rows with `pursuing_entity_id` matching Envision or NULL → migrate. Rows matching Riverstone/PD Systems → drop. |
| `sam_opportunities` (20,062 rows) | Keep all as reference feed. Only promote to V3 active opportunities if Envision is actively pursuing (determined by match against `gda_opportunity_tracker` or `opportunities`). Unpursued SAM records stay in `sam_opportunities_archive`. |
| `gda_opportunity_tracker` (1,924 rows) | Inspect each row for partner-tagged content. Default: all rows are Envision (this is Envision's tracker). |
| `gda_action_items` | Filter by `owner` / `assigned_to` — keep rows assigned to Envision staff only. |
| `gda_relationships` / `gda_touchpoints` | Keep rows where at least one party is Envision. |

### 3.3 Ambiguous-row triage

Rows that cannot be classified by the rules above are exported to a CSV for human triage before final cutover:

```
File: import-triage/ambiguous-rows-<timestamp>.csv
Columns: legacy_table, legacy_id, title, pursuing_entity_id, data_source, reason_ambiguous
```

The import script pauses at the triage step and waits for the annotated CSV to be returned with a `disposition` column (`keep` or `drop`) before proceeding.

---

## 4. Source backfill plan

### 4.1 Backfill from existing identifiers

Rows that have a federal identifier but no explicit source URL can be backfilled:

| Legacy column | Backfill rule | Resulting `source_kind` | Resulting `source_url` |
|---|---|---|---|
| `solicitation_number` (not null) | Construct SAM.gov URL: `https://sam.gov/opp/{solicitation_number}/view` | `sam_gov` | Constructed URL |
| `sam_notice_id` (if present in merged data) | Construct SAM.gov URL from notice ID | `sam_gov` | Constructed URL |
| `raw_source_url` (not null, contains `sam.gov`) | Use as-is | `sam_gov` | Raw URL value |
| `raw_source_url` (not null, contains `govtribe`) | Use as-is | `govtribe` | Raw URL value |
| `raw_source_url` (not null, contains `govwin`) | Use as-is | `govwin` | Raw URL value |
| `raw_source_url` (not null, other domain) | Use as-is | `news` or `internal` (heuristic) | Raw URL value |
| `data_source = 'govtribe'` | Use GovTribe API to resolve | `govtribe` | Resolved URL |
| `data_source = 'govwin'` | Use GovWin API to resolve | `govwin` | Resolved URL |

### 4.2 Rows where backfill is impossible

Rows with no `solicitation_number`, no `raw_source_url`, no `sam_notice_id`, and `data_source = 'manual'` or NULL:

```sql
-- Mark as legacy_unknown
UPDATE v3_opportunities
SET source_kind = 'legacy_unknown',
    source_url  = NULL
WHERE source_kind IS NULL
  AND source_url IS NULL;
```

These rows are flagged for post-cutover review:

```sql
-- Generate review list
SELECT id, legacy_id, title, agency, created_at
FROM v3_opportunities
WHERE source_kind = 'legacy_unknown'
ORDER BY created_at DESC;
```

**Post-cutover backfill plan:**
1. Week 1–2: Manual review of `legacy_unknown` rows by Shawn. For each, either:
   - Locate the source and update `source_kind` / `source_url`
   - Confirm the row is manually created Envision data → set `source_kind = 'internal'`
   - Mark as stale/irrelevant → soft-delete
2. Week 3–4: Run automated SAM.gov + GovTribe lookups for remaining `legacy_unknown` rows using title + agency + date fuzzy matching.
3. Month 2: Any remaining `legacy_unknown` rows are accepted as `source_kind = 'internal'` (Envision institutional knowledge, no external source exists).

### 4.3 R1 compliance target

| Metric | Target |
|---|---|
| Source URL coverage at cutover | ≥ 85% of active opportunities |
| Source URL coverage at cutover + 30 days | ≥ 95% |
| Acceptable `legacy_unknown` rows (post-backfill) | ≤ 5% of active records |

---

## 5. ID mapping

### 5.1 Primary key migration

Legacy `opportunities.id` is `text` (verified in prod). V3 `opportunities.id` will be `BIGSERIAL`.

**Strategy:** Every V3 table that absorbs legacy data includes a `legacy_id TEXT` column:

```sql
CREATE TABLE v3_opportunities (
  id         BIGSERIAL PRIMARY KEY,
  legacy_id  TEXT,       -- preserves traceability to legacy opportunities.id
  -- ... other columns
  CONSTRAINT uq_legacy_id UNIQUE (legacy_id)  -- enables reverse lookup
);
```

- `legacy_id` is populated during import and preserved for the 30-day rollback window.
- After the rollback window closes (Day 31+), `legacy_id` remains as a permanent historical reference but the UNIQUE constraint may be relaxed.
- All API responses include `legacy_id` in the V3 response envelope during the soak period so that any external integrations referencing the old text ID can be identified and updated.

### 5.2 FK fan-out

Every table that FK'd to `opportunities.id` (legacy text PK) needs the same treatment:

| Legacy table | Legacy FK column | Legacy FK target | V3 action |
|---|---|---|---|
| `bid_recommendations` | `opportunity_id` | `opportunities.id` (text) | Re-key via `legacy_id` lookup |
| `capture_gate_reviews` | `opportunity_id` | `opportunities.id` (text) | Re-key via `legacy_id` lookup |
| `capture_guardrail_alerts` | `opportunity_id` | `opportunities.id` (text) | Re-key via `legacy_id` lookup |
| `capture_plans` | `opportunity_id` | `opportunities.id` (text) | Table dropped (0 rows); N/A |
| `merger_opp_impacts` | `opportunity_id` | `opportunities.id` (text) | Re-key via `legacy_id` lookup |
| `proposals` | `opportunity_id` | `opportunities.id` (text) | Re-key via `legacy_id` lookup |
| `shred_jobs` | `opportunity_id` | `opportunities.id` (text) | Re-key via `legacy_id` lookup |
| `gda_decision_memory` | `opportunity_id` | `gda_opportunity_tracker.id` | Re-key via tracker-to-V3 mapping |

**Re-keying algorithm:**

```
FOR each dependent row:
  1. Look up legacy_id in v3_opportunities WHERE legacy_id = row.opportunity_id
  2. If found → set row.opportunity_id = v3_opportunities.id (BIGSERIAL)
  3. If NOT found → log as orphaned FK; set opportunity_id = NULL; flag for review
```

Orphaned FK rows are exported to `import-triage/orphaned-fk-<table>-<timestamp>.csv` for human review.

### 5.3 Cross-table ID mapping for shadow tables

Shadow tables that reference `gda_opportunity_tracker.id` need a mapping table:

```sql
CREATE TEMPORARY TABLE opp_id_map (
  legacy_tracker_id  BIGINT,   -- gda_opportunity_tracker.id
  legacy_backend_id  TEXT,     -- opportunities.id (legacy text PK)
  v3_id              BIGINT    -- v3_opportunities.id
);
```

This mapping is populated during the opportunity merge (Section 1.1) and used by all dependent table imports.

---

## 6. Order of operations (import sequence)

### Step 0 — Pre-flight

- Verify V3 schema is deployed (all V3 CREATE TABLE statements applied)
- Verify V3 database is empty (or truncated from a previous dry run)
- Verify prod legacy database is accessible (read-only connection)
- Generate `opp_id_map` from the three opportunity tables

### Step 1 — Lookup / reference tables

Import order:
1. `users` (no FKs)
2. `source_registry` (no FKs)
3. `knowledge_collections` (no FKs)
4. `escalation_rules` (no FKs)
5. `agent_config` (no FKs)
6. `report_templates` (no FKs)
7. `ft_signal_source` (no FKs)
8. `company_entity` (no FKs)
9. `company_profile` (no FKs)
10. `bot_entities`, `bot_glossary`, `bot_sources` (no FKs)
11. `anomaly_rules` (FK: `users`)
12. `gov_source_feeds` (no FKs)
13. `procurement_vehicles` (no FKs)
14. `feature_flags` (no FKs — re-seed V3 values)
15. `feed_config` (no FKs)
16. `prompts` (no FKs)
17. `mergers_acquisitions` (no FKs)
18. `gda_teaming_partners` → V3 `teaming_attachments` (no FKs)

### Step 2 — Core fact tables

Import order:
1. `sam_opportunities` + `gda_opportunity_tracker` + `opportunities` → V3 `opportunities` (merged per Section 1.1)
2. Populate `opp_id_map` from merge results

### Step 3 — First-level dependents

Import order (all use `opp_id_map` for FK re-keying):
1. `gda_capture_plans` → V3 `captures`
2. `gda_action_items` → V3 `action_items`
3. `gda_compliance_matrices` → V3 `compliance_items`
4. `bid_recommendations` (re-key opp FK)
5. `capture_gate_reviews` (re-key opp FK)
6. `capture_guardrail_alerts` (re-key opp FK)
7. `proposals` (re-key opp FK)
8. `shred_jobs` (re-key opp FK)
9. `merger_opp_impacts` (re-key opp FK)
10. `gda_decision_memory` (re-key opp FK via tracker mapping)
11. `gda_saved_opportunities` (re-key opp FK)
12. `gda_pwin_scores` (re-key opp FK if applicable)
13. `gda_opportunity_alerts` + `opportunity_alerts` → V3 `opportunity_alerts` (merged, re-keyed)

### Step 4 — Second-level dependents

Import order:
1. `extracted_requirements` (FK: `shred_jobs`)
2. `proposal_sections` (FK: `proposals`)
3. `proposal_section_versions` (FK: `proposal_sections`)
4. `proposal_compliance_map` (FK: `proposals`, `proposal_sections`)
5. `gda_action_history` → V3 `action_item_history` (FK: action items)
6. `capture_coach_results` (standalone)
7. `gda_capture_lessons` (standalone)
8. `color_reviews` (standalone)
9. `compliance_requirements` (standalone)

### Step 5 — Standalone / institutional knowledge tables

Import order (no dependency on core fact tables):
1. `contacts` (+ merge `gda_contacts` if DECIDE → merge)
2. `gda_relationships` → V3 `relationships`
3. `gda_touchpoints` → V3 `touchpoints` (FK: `relationships`)
4. `cpars_records`
5. `financial_kpis`, `monthly_financials`
6. `deep_research_reports` (+ merge `gda_deep_research` if DECIDE → merge)
7. `discussion_threads`, `discussion_messages`
8. `doctrine_drafts`, `doctrine_publish_runs`
9. `intel_items`
10. `knowledge_documents` (FK: `knowledge_collections`, `uploaded_files`)
11. `uploaded_files`
12. `fpds_awards`
13. `fast_track_matches`, `ft_opportunity_signal`
14. `competitor_profiles`, `competitor_movements`
15. `gda_active_contracts`, `gda_aop_tracker`
16. `gda_idiq_tracker`, `gda_meeting_notes`, `gda_naics_tracking`
17. `gda_ndaa_intel`, `gda_ooda_loops`, `gda_pattern_library`
18. `gda_prompt_architect_memory`, `gda_risk_register` + `risk_register`
19. `gda_stage_audit`, `gda_wargames`, `gda_e2e_reports`
20. `gda_dept_market`, `gda_doc_inbox`
21. `gda_competitor_watchlist`, `gda_intelligence_log`
22. `gda_incumbent_analysis`
23. `govtribe_credit_ledger`, `govtribe_credit_monthly`, `govwin_call_log`
24. `sam_scan_runs`, `sam_verification_runs`
25. `source_sync_runs` (FK: `source_registry`)
26. `source_health_snapshots`, `system_health_snapshots`
27. `scheduled_reports`, `generated_reports` (FK: `report_templates`)
28. `enrichment_call_log`
29. `clause_references` (+ merge `gda_clause_library` if DECIDE → merge)
30. `document_embeddings` (re-index after import)

### Step 6 — Dependent operational tables

1. `agent_runs` (FK: `agent_config`)
2. `approval_queue` (FK: `agent_config`, `agent_runs`)
3. `fix_proposals` (FK: `agent_runs`)
4. `escalations` (FK: `escalation_rules`)
5. `notifications` — DROPPED; not migrated
6. `email_log` (FK: `notifications`, `users`) — only if `notifications` migrated; otherwise DROP

### Step 7 — Audit log (always last)

1. `audit_log` (FK: `users`)
2. `record_version` (16,425 rows, 26 MB) — import with original timestamps preserved

### Dry-run mode

Every step above supports:
- `--dry-run` — validates all SQL but commits nothing; outputs row counts and FK resolution stats
- `--step=N` — runs only step N
- `--resume-from=N` — resumes from step N (skips completed steps)
- `--full-redo` — truncates V3 tables and re-runs all steps

---

## 7. Idempotency & re-runnability

### 7.1 Import script modes

The V3 import script must support four execution modes:

| Mode | Flag | Behavior |
|---|---|---|
| Dry run | `--dry-run` | Read all legacy data, compute transforms, validate FK resolution, output projected row counts. Commit nothing. |
| Partial run | `--step=N` | Execute only step N. Useful for debugging a single step. |
| Resume | `--resume-from=N` | Read `import_log` to confirm steps 1–(N-1) are complete, then continue from step N. |
| Full redo | `--full-redo --confirm-truncate` | Truncate all V3 tables (CASCADE), reset `import_log`, re-run all steps from scratch. Requires explicit confirmation flag. |

### 7.2 Import log table

```sql
CREATE TABLE import_log (
  id          BIGSERIAL PRIMARY KEY,
  step        INT NOT NULL,
  step_name   TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status      TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  rows_read   INT DEFAULT 0,
  rows_written INT DEFAULT 0,
  rows_skipped INT DEFAULT 0,
  errors      JSONB DEFAULT '[]',
  dry_run     BOOLEAN NOT NULL DEFAULT FALSE
);
```

### 7.3 Idempotency guarantees

- Each step checks `import_log` for a prior `success` entry before running. If found, the step is skipped (logged as `skipped`).
- `--full-redo` resets all `import_log` entries.
- Individual table imports use `INSERT ... ON CONFLICT (legacy_id) DO UPDATE` (upsert) so that re-running a step updates existing rows rather than duplicating.
- The `opp_id_map` is regenerated at the start of every run to ensure FK references are current.

### 7.4 Error handling

- Per-row errors are caught, logged to `import_log.errors` (JSONB array), and the import continues to the next row.
- If a step's error count exceeds 5% of rows read, the step halts and logs `status = 'failed'`.
- Failed steps can be retried with `--resume-from=N` after the root cause is fixed.
- All errors include: `legacy_table`, `legacy_id`, `error_message`, `error_detail`.

---

## 8. Parity verification

### 8.1 Verification script

After import completes, a parity verification script runs automatically (or manually via `--verify-only`). It compares:

#### Row count parity

| Concept | Legacy source(s) | V3 target | Expected relationship |
|---|---|---|---|
| Opportunities | `sam_opportunities` + `gda_opportunity_tracker` + `opportunities` | `v3_opportunities` | V3 ≤ sum of sources (some rows merged/dropped) |
| Captures | `gda_capture_plans` | `v3_captures` | V3 = source (1:1) |
| Action items | `gda_action_items` | `v3_action_items` | V3 ≤ source (Envision filter) |
| Users | `users` | `v3_users` | V3 = source (1:1) |
| All KEEP tables | 1:1 | 1:1 | Exact match |
| All TRANSFORM tables | varies | varies | V3 ≤ source (documented per table) |

#### Sample row spot-checks

- Random 50 opportunities: every field matches expectation (title, agency, NAICS, value, dates, source)
- Random 20 captures: capture plan fields match
- Random 20 action items: description, owner, due date match

#### Financial parity

```sql
-- Legacy
SELECT SUM(value_estimated) AS legacy_total
FROM opportunities
WHERE value_estimated IS NOT NULL;

-- V3
SELECT SUM(COALESCE(value_max, value_min, value_estimated)) AS v3_total
FROM v3_opportunities
WHERE value_estimated IS NOT NULL OR value_min IS NOT NULL;
```

Expected: V3 total ≈ legacy total (within 5% tolerance, accounting for merged/dropped rows).

#### Source URL coverage (R1 compliance metric)

```sql
SELECT
  COUNT(*) AS total_opportunities,
  COUNT(*) FILTER (WHERE source_url IS NOT NULL) AS with_source,
  ROUND(100.0 * COUNT(*) FILTER (WHERE source_url IS NOT NULL) / COUNT(*), 1) AS coverage_pct,
  COUNT(*) FILTER (WHERE source_kind = 'legacy_unknown') AS legacy_unknown_count
FROM v3_opportunities;
```

Target: ≥ 85% coverage at cutover.

#### FK integrity check

```sql
-- For each table with re-keyed FKs:
SELECT COUNT(*) AS orphaned_fks
FROM v3_bid_recommendations br
LEFT JOIN v3_opportunities o ON br.opportunity_id = o.id
WHERE br.opportunity_id IS NOT NULL AND o.id IS NULL;
-- Expected: 0
```

### 8.2 Output artifact

The verification script produces `import-parity-report.md` containing:
- Timestamp of verification run
- Row count comparison table (legacy vs. V3, with delta and %)
- Spot-check results (pass/fail per record)
- Financial parity comparison
- Source URL coverage metrics
- FK integrity results
- Overall pass/fail verdict

---

## 9. Rollback plan

### 9.1 Frontend cutover mechanism

V3 cutover is controlled by a single environment variable:

```
API_VERSION=v3   # or API_VERSION=v2 to revert
```

The frontend reads `API_VERSION` and routes API calls to either `/api/v2/*` (legacy) or `/api/v3/*` (new). Both API versions remain deployed during the soak period.

### 9.2 Rollback trigger

If V3 cutover fails post-flip, the rollback process is:

1. **Immediate (< 5 min):** Set `API_VERSION=v2` in the environment. Frontend instantly reverts to legacy API endpoints.
2. **No data loss:** The legacy database is **never modified** by the V3 import process. V3 import reads from legacy (read-only) and writes to the V3 database. Legacy stays intact.
3. **DNS/proxy:** No DNS changes needed — same domain, same server, different API prefix.

### 9.3 Legacy database preservation

- Legacy Postgres database is **untouched** throughout the migration. No writes, no deletes, no schema changes.
- V3 import is a **one-way read** from legacy into the V3 database.
- Legacy database is kept running for the full 30-day soak period.
- After 30-day soak with no rollback, legacy database is archived to a pg_dump and the legacy API routes are removed.

### 9.4 Rollback verification

After reverting to `API_VERSION=v2`:
1. Verify all legacy API endpoints return 200
2. Verify frontend renders legacy data correctly
3. Verify n8n webhooks continue to function (they write to legacy DB, unaffected by V3)

### 9.5 Soak period timeline

| Day | Action |
|---|---|
| Day 0 | V3 cutover: `API_VERSION=v3` |
| Day 1–7 | Active monitoring: error rates, response times, data correctness |
| Day 7 | Checkpoint: if error rate > 1%, roll back |
| Day 8–14 | Extended monitoring |
| Day 14 | Checkpoint: if no issues, begin legacy API deprecation |
| Day 15–30 | Legacy API still available but marked deprecated |
| Day 31 | Archive legacy database. Remove legacy API routes. `legacy_id` columns remain. |

---

## 10. Open questions for Phase 1 review

| # | Question | Impact | Default if unanswered |
|---|---|---|---|
| 1 | **`gda_clause_library` vs. `clause_references`:** Are these redundant or complementary? | Determines whether we merge or keep both | Keep both as separate tables |
| 2 | **`gda_contacts` vs. `contacts`:** Should these be merged by email deduplication? | Determines contact migration strategy | Merge by email; prefer canonical `contacts` row, supplement with `gda_contacts` fields |
| 3 | **`gda_contract_vehicles` vs. `procurement_vehicles`:** Redundant? | Vehicle data migration | Keep `procurement_vehicles` as canonical; merge unique `gda_contract_vehicles` rows |
| 4 | **`gda_deep_research` vs. `deep_research_reports`:** Merge? | Research data migration | Merge; deduplicate by title + date |
| 5 | **`gda_discussions` vs. `discussion_threads`:** Merge? | Discussion data migration | Keep canonical `discussion_threads`; import unique `gda_discussions` |
| 6 | **`gda_knowledge_base` vs. `knowledge_documents`:** Merge? | Knowledge base migration | Keep canonical `knowledge_documents`; import unique `gda_knowledge_base` entries |
| 7 | **`gda_win_loss` vs. `gda_win_loss_db` vs. `win_loss_analyses`:** Three tables for same concept. Which is canonical? | Win/loss data migration | Merge all into single `win_loss` table; human triage for conflicts |
| 8 | **`sam_opportunities` full import vs. Envision-only filter:** Import all 20,062 SAM rows or only those Envision is pursuing? | V3 opportunity table size | Import all as reference feed; mark only pursued rows as `status = 'active'` |
| 9 | **`record_version` (16,425 rows, 26 MB):** Import full history or truncate to last 90 days? | Migration speed and V3 database size | Import full history (26 MB is trivial) |
| 10 | **Dual migration tracker reconciliation:** Who reconciles `schema_migrations` vs. `_migrations` before V3 deploy? | V3 migration system integrity | V3 starts fresh; legacy trackers are archived, not reconciled |
| 11 | **`email_log` dependency on `notifications`:** If `notifications` is dropped, should `email_log` also drop? | Operational history | Drop both; V3 rebuilds notification system |
| 12 | **n8n workflow migration to V3 API:** Which of the 11 live webhooks continue pointing at legacy DB vs. rewired to V3? | n8n integration timeline | All n8n workflows rewired to V3 API endpoints in Phase 3; legacy DB connections removed |

---

## Out of scope

- **Schema design** → F-201
- **API contract** → F-202
- **Test strategy** → F-204
- **Actual import script code** — this document is strategy only; no code
- **n8n workflow rewrite** — covered in Phase 3
- **Frontend migration** — covered in Phase 4/5
