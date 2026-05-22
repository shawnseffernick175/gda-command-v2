# F-023a — Deferred Shadow Table Content Diligence

**Date:** 2026-05-22
**Author:** Devin (automated diligence)
**Status:** READ-ONLY ASSESSMENT — No modifications made
**Issue:** [#258](https://github.com/shawnseffernick175/gda-command-v2/issues/258)
**Prerequisite:** F-023 Step 2 (PR #284) — 12 tables dropped, 6 deferred to this review

---

## Summary

| # | Table | Rows | Stale Since | Data Quality | Refs | Proposed Disposition |
|---|-------|------|-------------|-------------|------|---------------------|
| 1 | `gda_incumbent_log` | 19 | 2026-04-21 | **Real production data** — 19 tracked opportunities | 0 | **ARCHIVE-THEN-DROP** |
| 2 | `gda_market_benchmarks` | 20 | 2026-04-03 | **Real production data** — GovTribe-sourced analytics | 0 | **ARCHIVE-THEN-DROP** |
| 3 | `gda_pre_sam_intel` | 53 | 2026-03-22 | **Real but stale** — web scrapes, all `reviewed=false` | 0 | **DROP** |
| 4 | `gda_target_agencies` | 5 | 2026-03-12 | **Real production data** — strategic agency targets | 0 | **ARCHIVE-THEN-DROP** |
| 5 | `gda_vehicle_tracker` | 14 | 2026-03-21 | **Real production data** — contract vehicle inventory | 0 | **ARCHIVE-THEN-DROP** |
| 6 | `gda_touchpoints` | 0 | N/A | Empty | 1 | **RECREATE-EMPTY** |

**Proposed counts:** 1 DROP / 4 ARCHIVE-THEN-DROP / 0 KEEP-AND-ADOPT / 1 RECREATE-EMPTY

**Methodology gap found:** None. All refs from earlier audits confirmed — 0 new references discovered
across 158 workflows (active + inactive), backend, frontend, and shared code.

---

## 1. gda_incumbent_log (19 rows)

### Metadata

| Metric | Value |
|--------|-------|
| Row count | 19 |
| Columns | 10: `id`, `opp_id`, `opportunity_name`, `incumbent_found`, `incumbent_name`, `source`, `award_date`, `contracting_agency`, `note`, `created_at` |
| Timestamp range | `created_at`: 2026-04-21 12:23 → 2026-04-21 12:39 (all inserted in 16-minute batch) |
| `award_date` range | 2016-01-01 → 2022-01-01 (historical awards) |
| Distinct `opportunity_name` | 19 (all unique) |
| Distinct `incumbent_name` | 6 values |
| PII | None |

### Sample Rows (3 of 19)

| id | opp_id | opportunity_name | incumbent_found | incumbent_name | source | contracting_agency |
|----|--------|-----------------|----------------|---------------|--------|-------------------|
| 19 | 31 | DCSA Cyber | true | Agile Decision Sciences LLC | GovTribe/SAM.gov | DCSA |
| 18 | 8 | SISO Risk Management Navy | false | Not Publicly Disclosed | GovTribe | NAVSUP |
| 17 | 7 | Agile System Coordinator AFLCMC | false | Not Publicly Disclosed | GovTribe | AFLCMC |

### Reference Search

| Scope | Count | Details |
|-------|-------|---------|
| Workflows (158 active+inactive) | 0 | — |
| Backend code (`packages/backend/`) | 0 | — |
| Frontend code (`packages/frontend/src/`) | 0 | — |
| Shared code (`packages/shared/`) | 0 | — |
| Scripts (`scripts/`) | 0 | — |

### Assessment

Real production data — 19 tracked federal contract opportunities with incumbent research
from GovTribe/SAM.gov. Data is from April 2026, covers named agencies (DCSA, NAVSUP, AFLCMC,
etc.) and specific programs (CSC III, Tradewind, C2SD). All 19 inserted in a single 16-minute
batch suggesting a one-time bulk import. No consumer exists (0 workflow refs), and the creating
workflow was likely deleted in F-022 cleanup.

### Proposed Disposition: **ARCHIVE-THEN-DROP**

Rationale: Valuable historical intel on incumbents that may inform future capture decisions.
No active consumer, but data has residual reference value. Archive to CSV in repo, then drop.

---

## 2. gda_market_benchmarks (20 rows)

### Metadata

| Metric | Value |
|--------|-------|
| Row count | 20 |
| Columns | 17: `id`, `benchmark_type`, `naics_code`, `agency`, `set_aside`, `contract_type`, `value_range_min`, `value_range_max`, `metric_name`, `metric_value`, `sample_size`, `confidence_interval`, `data_source`, `period_start`, `period_end`, `computed_at`, `raw_data` |
| Timestamp range | `computed_at`: 2026-04-03 23:14 → 2026-04-03 23:48 (all in 34-minute batch) |
| `period_start` range | 2024-01-01 → 2025-01-01 |
| Distinct `benchmark_type` | 5: `set_aside_mix`, `win_rate`, `agency_volume`, `pricing`, `market_share` |
| Distinct `agency` | 9: ALL, Army ACC-APG, ONR, DFAS, Air Force, DISA, Navy, etc. |
| PII | None |

### Sample Rows (3 of 20)

| id | benchmark_type | naics_code | agency | metric_name | metric_value | sample_size | data_source |
|----|---------------|-----------|--------|------------|-------------|------------|------------|
| 20 | agency_volume | 541512 | Air Force | total_obligated | 2,240,640,797 | 208 | govtribe_aggregations |
| 19 | agency_volume | 541512 | Army ACC-APG | total_obligated | 2,104,648,757 | 153 | govtribe_aggregations |
| 18 | agency_volume | 541512 | DISA | total_obligated | 2,223,583,512 | 202 | govtribe_aggregations |

### Reference Search

| Scope | Count |
|-------|-------|
| Workflows (158) | 0 |
| Backend/Frontend/Shared/Scripts | 0 |

### Assessment

Real GovTribe-sourced market analytics for NAICS 541512 (IT services). Covers win rates,
set-aside mix, pricing benchmarks, and agency obligation volumes with sample sizes. All computed
in a single batch on 2026-04-03. Valuable competitive intelligence for pricing and BD strategy,
but no active consumer.

### Proposed Disposition: **ARCHIVE-THEN-DROP**

Rationale: Point-in-time market analytics that can inform pricing decisions. Data is 7 weeks old
but the benchmark methodology (NAICS-scoped, agency-specific) has reuse value. Archive to CSV.

---

## 3. gda_pre_sam_intel (53 rows)

### Metadata

| Metric | Value |
|--------|-------|
| Row count | 53 |
| Columns | 11: `id`, `title`, `url`, `content_preview`, `category`, `dept`, `relevance_score`, `source`, `discovered_at`, `reviewed`, `action_taken` |
| Timestamp range | `discovered_at`: all 2026-03-22 17:03 (single batch) |
| Distinct `title` | 50 (3 duplicates) |
| Distinct `category` | 1: `UNKNOWN` (all unclassified) |
| `reviewed` | All `false` — none ever reviewed |
| PII | None |

### Sample Rows (3 of 53)

| id | title | category | dept | relevance_score | reviewed |
|----|-------|---------|------|----------------|---------|
| 53 | America's Brand New Air Traffic Control System - FAA | UNKNOWN | Unknown | 30 | false |
| 52 | FAA says air traffic control overhaul... $1.5 billion | UNKNOWN | Unknown | 30 | false |
| 51 | Brand New Air Traffic Control System (BNATCS) Fact Sheet | UNKNOWN | Unknown | 30 | false |

### Reference Search

| Scope | Count |
|-------|-------|
| Workflows (158) | 0 |
| Backend/Frontend/Shared/Scripts | 0 |

### Assessment

Web scrapes from a "Pre-SAM Monitor" tool — 53 pages discovered in a single batch on
2026-03-22. All assigned `category=UNKNOWN`, `dept=Unknown`, `relevance_score=30`, and
`reviewed=false`. This is raw, unprocessed crawl output that was never triaged. Content is
primarily FAA/DOT news articles and DOD acquisition notices. The scraping workflow no longer exists.

### Proposed Disposition: **DROP**

Rationale: Unreviewed web scrapes with no classification, no triage, and no consumer. All content
is publicly available via the original URLs. Two months stale with no value-add over a fresh scrape.
Not worth archiving — the URLs are the only value, and those are public.

---

## 4. gda_target_agencies (5 rows)

### Metadata

| Metric | Value |
|--------|-------|
| Row count | 5 |
| Columns | 10: `id`, `agency`, `match_key`, `fy26_budget`, `addressable`, `primary_fit`, `fit_color`, `why`, `sort_order`, `updated_at` |
| Timestamp range | `updated_at`: all 2026-03-12 13:15 (single batch) |
| Distinct `agency` | 5 (all unique) |
| PII | None |

### All 5 Rows

| id | agency | match_key | fy26_budget | addressable | primary_fit | why |
|----|--------|----------|-------------|------------|------------|-----|
| 1 | Department of Defense | dod | $886B | $12,000M | EIS+PD | Largest IT buyer. Cyber, C4ISR, cloud, DevSecOps, zero trust |
| 2 | Dept of Health and Human Services | hhs | $127B | $2,100M | Riverstone | NIH/CMS/CDC — data analytics, EHR, AI/ML, IT modernization |
| 3 | Dept of Veterans Affairs | va | $325B | $1,800M | EIS+PD | EHR modernization, IT systems, healthcare tech |
| 4 | Dept of Homeland Security | dhs | $98B | $1,400M | Riverstone | CBP, TSA, CISA — cyber, DevSecOps, Zero Trust |
| 5 | Department of Energy | doe | $52B | $620M | Riverstone+PD | Nuclear security, AI/ML, cyber defense, national labs IT |

### Reference Search

| Scope | Count |
|-------|-------|
| Workflows (158) | 0 |
| Backend/Frontend/Shared/Scripts | 0 |

### Assessment

Strategic target agency roster with FY26 budget estimates, addressable market sizing, and
business unit fit designations (EIS, PD, Riverstone). This is business-strategy-grade data
that clearly took analyst time to curate. Only 5 rows but high information density. Created
2026-03-12 — about 10 weeks old.

### Proposed Disposition: **ARCHIVE-THEN-DROP**

Rationale: Curated strategic data with clear business value. Small enough to preserve in full.
The `match_key` column suggests it was designed to join against opportunity data. Archive to CSV;
may also want to consider re-ingesting into the ADOPT-bucket `gda_opportunity_tracker` ecosystem
if the fit-color/primary-fit data is useful for capture planning.

**Architect question:** Is the EIS/PD/Riverstone fit model still current, or has the business unit
alignment changed? If current, this data might be worth promoting to KEEP-AND-ADOPT.

---

## 5. gda_vehicle_tracker (14 rows)

### Metadata

| Metric | Value |
|--------|-------|
| Row count | 14 |
| Columns | 11: `id`, `vehicle_name`, `vehicle_type`, `eis_on_vehicle`, `ceiling_value`, `last_date_to_order`, `agency`, `naics_scope`, `notes`, `govtribe_id`, `updated_at` |
| Timestamp range | `updated_at`: all 2026-03-21 21:11 (single batch) |
| Distinct `vehicle_name` | 14 (all unique) |
| Distinct `vehicle_type` | 3: `MAC`, `GWAC`, `IDIQ` |
| PII | None |

### Sample Rows (3 of 14)

| id | vehicle_name | vehicle_type | eis_on_vehicle | agency | notes |
|----|-------------|-------------|---------------|--------|-------|
| 14 | Polaris | GWAC | false | GSA | SB IT GWAC - replacing STARS/Alliant SB |
| 13 | HCaTS | IDIQ | false | GSA | Human Capital services |
| 12 | PACTS III | IDIQ | false | GSA | SB professional services |

### Reference Search

| Scope | Count |
|-------|-------|
| Workflows (158) | 0 |
| Backend/Frontend/Shared/Scripts | 0 |

### Assessment

Contract vehicle inventory — 14 named vehicles (T4NG2, SEWP VI, ITES-4S, SeaPort-NxG,
MDA SHIELD, Polaris, etc.) with type classification and EIS eligibility flags. This is
analyst-curated reference data for the capture pipeline. Note: a **separate** DOCUMENT-ONLY
table `gda_contract_vehicles` (26 columns, ~2 rows, 2 workflow refs) exists in the active
shadow schema, managed by `GDA.api.vehicle-tracker` and `GDA.api.capture-hub`.

### Proposed Disposition: **ARCHIVE-THEN-DROP**

Rationale: Useful reference data but superseded by the active `gda_contract_vehicles` table
(which has richer schema — 26 vs 11 columns — and active workflow consumers). Archive this
14-row snapshot for comparison, then drop.

**Architect question:** Should the 14 records from this table be merged into `gda_contract_vehicles`
before dropping? The schemas differ significantly (this table has `eis_on_vehicle`, `govtribe_id`;
the active table has different columns), so a manual mapping would be needed.

---

## 6. gda_touchpoints (0 rows, 1 workflow ref)

### Metadata

| Metric | Value |
|--------|-------|
| Row count | 0 |
| Columns | 7: `id`, `relationship_id`, `contact_type`, `summary`, `next_action`, `next_action_date`, `created_at` |
| FK | `relationship_id → gda_relationships(id)` |
| PII | None (but parent `gda_relationships` has PII — promoted to ADOPT in PR #284) |

### Workflow Deep-Dive: GDA.api.relationship-tracker

| Field | Value |
|-------|-------|
| Workflow ID | `ck1NTtdvuqB7CQ81` |
| Active | **true** |
| Trigger | Webhook (`gda-relationship-tracker`) |
| Last execution | **Never** — 0 executions |
| Node count | 12 |

**SQL analysis — 2 nodes reference `gda_touchpoints`:**

**Node: `List Contacts`** — READS + CREATES:
```sql
CREATE TABLE IF NOT EXISTS gda_relationships (...);
CREATE TABLE IF NOT EXISTS gda_touchpoints (
  id SERIAL PRIMARY KEY,
  relationship_id INTEGER REFERENCES gda_relationships(id),
  contact_type TEXT,
  summary TEXT,
  next_action TEXT,
  next_action_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
SELECT r.*, 
  (SELECT COUNT(*) FROM gda_touchpoints t WHERE t.relationship_id = r.id) as touchpoint_count,
  (SELECT MAX(t.created_at) FROM gda_touchpoints t WHERE t.relationship_id = r.id) as last_touchpoint
FROM gda_relationships r ORDER BY ...
```

**Node: `Log Touchpoint`** — WRITES:
```sql
INSERT INTO gda_touchpoints (relationship_id, contact_type, summary, next_action, next_action_date)
VALUES ($1, $2, $3, $4, COALESCE(NULLIF($5, '')::DATE, NULL)) RETURNING *;
UPDATE gda_relationships SET last_contact_date = CURRENT_DATE, updated_at = NOW() WHERE id = $1
```

**Behavior if table is missing:** The `List Contacts` node runs `CREATE TABLE IF NOT EXISTS`
before querying — the workflow is **self-healing**. If `gda_touchpoints` were dropped, the next
invocation of `List Contacts` would recreate it. However, since the workflow has never been
executed, this path has never been tested in production.

### Reference Search

| Scope | Count | Details |
|-------|-------|---------|
| Workflows (158) | 1 | `GDA.api.relationship-tracker` (2 nodes: read + write) |
| Backend/Frontend/Shared/Scripts | 0 | — |

### Assessment

Child table of `gda_relationships` (ADOPT bucket, PR #284). Together they form the
relationship-tracker feature. The workflow is active but never invoked — it's webhook-only
(`gda-relationship-tracker` path). The table is empty and would be auto-created by the
workflow's `CREATE TABLE IF NOT EXISTS` if dropped.

### Proposed Disposition: **RECREATE-EMPTY**

Rationale: Keep the table in place so the relationship-tracker workflow doesn't need to create
it on first call (reduces first-invocation latency, avoids DDL at runtime). Since
`gda_relationships` was promoted to ADOPT, `gda_touchpoints` should follow — it's an integral
part of the same feature. When F-023c generates migrations for ADOPT tables, include
`gda_touchpoints` in the `gda_relationships` migration as a companion table.

**Recommendation:** Promote `gda_touchpoints` from DEFERRED to **ADOPT** alongside
`gda_relationships` (its parent). They are a single feature unit.

---

## Architect Decision Points

1. **gda_target_agencies:** Is the EIS/PD/Riverstone fit model still current? If yes,
   consider KEEP-AND-ADOPT instead of ARCHIVE-THEN-DROP.

2. **gda_vehicle_tracker:** Should the 14 records be merged into the active
   `gda_contract_vehicles` table before dropping?

3. **gda_touchpoints:** Promote to ADOPT alongside `gda_relationships`? This would make
   the ADOPT count 28 (was 27).

---

## Archive Locations

All tables already have schema+data dumps in `/tmp/f023-deferred-archive/` on VPS (from PR #284).
If ARCHIVE-THEN-DROP is approved, CSV exports will be committed to `docs/audits/archive/` in the
execution PR.
