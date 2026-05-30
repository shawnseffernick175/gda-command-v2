# V3 Data Migration — Run Procedure & Parity Report Format

**Module:** `apps/backend-v3/src/migration/`
**CI Job:** `migration-parity-check` in `.github/workflows/ci.yml`
**Binding contracts:** R1 (source provenance), R2 (analysis auto-trigger)

---

## Overview

The migration pipeline moves all production data from the legacy V2 schema into V3, producing a machine-verifiable parity report proving V3 returns the same answers as V2 for every entity.

### Architecture

```
V2 Legacy DB (read-only)
     │
     ▼
 ┌─────────┐     ┌─────────────┐     ┌──────────┐
 │ Extract  │────▶│  Transform  │────▶│   Load   │
 └─────────┘     └─────────────┘     └──────────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │ Parity Report│
                                    │ + R2 Audit   │
                                    └─────────────┘
```

### Pipeline stages

| Stage | File | Purpose |
|---|---|---|
| Extract | `extract.ts` | Read from legacy V2 tables via `LEGACY_DATABASE_URL` (separate Pool, read-only) |
| Transform | `transform.ts` | Map V2 rows to V3 schema; coerce types, normalize timestamps to UTC ISO 8601, populate `*_sources` arrays |
| Load | `load.ts` | Write to V3; idempotent via `ON CONFLICT DO UPDATE` with deterministic last-write-wins on `updated_at` |
| Orchestrator | `run.ts` | CLI entry point; dry-run by default, `--commit` to write, `--entity` to filter |
| Parity Report | `parity-report.ts` | Generate the 4-section parity report (counts, field coverage, gaps, R2 audit) |
| R2 Audit | `r2-audit.ts` | Programmatic R2 invariant checks |

---

## Run procedure

### Prerequisites

- `LEGACY_DATABASE_URL` environment variable pointing to the V2 database (read-only access sufficient)
- `DATABASE_URL` environment variable pointing to the V3 database (write access required)

### Commands

```bash
# Dry-run — counts only, no writes
cd apps/backend-v3
npx tsx src/migration/run.ts

# Commit — actually write to V3
npx tsx src/migration/run.ts --commit

# Migrate a single entity type
npx tsx src/migration/run.ts --commit --entity opportunity
npx tsx src/migration/run.ts --commit --entity capture
npx tsx src/migration/run.ts --commit --entity action_item

# Generate parity report from existing V3 data (no legacy connection needed)
npx tsx src/migration/run.ts --report-only
```

### npm scripts (from `apps/backend-v3/`)

```bash
npm run migrate:dry-run       # dry-run all entities
npm run migrate:commit        # commit all entities
npm run migrate:report        # report-only mode
```

---

## Entity mapping

### V2 → V3 table mapping

| V2 Source Table(s) | V3 Target Table | Merge Strategy |
|---|---|---|
| `sam_opportunities` + `gda_opportunity_tracker` + `opportunities` | `opportunities` | Deduplicate by `solicitation_number`; SAM.gov values win for federal fields |
| `gda_capture_plans` | `captures` | Re-link `opportunity_id` via legacy ID lookup |
| `gda_action_items` | `action_items` | Status normalization (completed/closed → done) |
| `source_registry` | `sources` | Kind normalization to R1 enum |
| `gda_teaming_partners` | `migration_partners` | Direct mapping with cert/vehicle preservation |

### Source-of-truth backfill (R1)

For every analysis field, the migration populates `*_sources` arrays:
- If V2 has a source URL → infer `SourceKind` from URL pattern and create a `SourceRef`
- If V2 has no source URL → set sources to `[]` and log a `MISSING_SOURCES` gap
- Sources are NEVER fabricated — only real V2 provenance is carried over

### R2 contract enforcement

- No `analysis_status` or `stale` columns in V3 schema
- Records with V2 analysis → copy into V3 `analysis` JSONB
- Records without V2 analysis → leave `analysis IS NULL` and enqueue pre-warm job
- Pre-warm jobs go to `analysis-opportunity` or `analysis-capture` pg-boss queues

---

## Parity report format

The report has 4 sections:

### A. Counts Table

| Entity | V2 count | V3 count | Delta | Notes |
|---|---|---|---|---|
| opportunities | N | N | 0 | exact match required |
| captures | N | N | 0 | exact match required |
| action_items | N | N | 0 | exact match required |
| sources | N | N | 0 | exact match required |
| partners | N | N | 0 | exact match required |

**Gate criterion:** Delta != 0 for any entity fails the gate.

### B. Field Coverage Table

For each analysis-bearing field (pwin, incumbent, competitors, blackhat, wargame, timeline):

| Field | V3 records with value | V3 records with sources | Coverage % |
|---|---|---|---|
| pwin | M | M | 100% |

### C. Gap List

Entities where V2 data could not migrate cleanly:

| Reason Code | Meaning |
|---|---|
| `MISSING_SOURCES` | V2 has the field value but no R1-compliant source URL |
| `TYPE_MISMATCH` | V2 value cannot be coerced to V3 schema type |
| `ORPHANED_REFERENCE` | V2 references an entity that does not exist in V3 |
| `DUPLICATE_KEY` | V2 has duplicate primary keys (deduplicated in V3) |

### D. R2 Invariant Audit

Programmatic checks that must all pass:

- No V3 row has `analysis_status` column
- No V3 row has `stale` column
- No V3 opportunity or capture has `analysis IS NULL` AND no pre-warm job
- Every populated `analysis.pwin` has non-empty `analysis.pwin_sources`
- Every populated `analysis.incumbent` has non-empty `analysis.incumbent_sources`
- Every populated `analysis.competitors` has non-empty `analysis.competitors_sources`

---

## CI integration

The `migration-parity-check` job in `.github/workflows/ci.yml`:

1. Spins up a PostgreSQL 16 service
2. Seeds the legacy fixture tables from `apps/backend-v3/src/migration/fixtures/legacy/seed.sql`
3. Runs migration in dry-run mode
4. Runs migration with `--commit`
5. Runs the migration test suite (`tests/migration/`)
6. Validates the gap list against `fixtures/legacy/expected-gaps.json`

### Fixture dataset

The CI fixture under `src/migration/fixtures/legacy/` contains:
- 3 SAM opportunities
- 1 GovTribe tracker opportunity
- 1 legacy backend opportunity
- 2 capture plans (1 linked, 1 orphaned)
- 3 action items (open, in_progress, done)
- 3 source registry entries
- 2 teaming partners (Riverstone, PD Systems)

---

## Idempotency

Re-running the migration produces the same V3 state:
- `ON CONFLICT (legacy_id) DO UPDATE` with deterministic merge logic
- `updated_at` uses last-write-wins: only updates if the incoming timestamp is newer
- No rollback mode — fix the migration code and re-run if the parity report fails

---

## Rollback policy

Forward-only. No "rollback to V2" mode exists. V3 tables are filled additively. If parity fails, fix the transform/load logic and re-run.
