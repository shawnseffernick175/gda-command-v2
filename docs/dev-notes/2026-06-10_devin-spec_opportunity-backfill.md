# Devin Spec — Opportunity Validator Backfill

**Branch:** `feat/opp-validator-backfill` (base `main @ b69e10a`)
**PR Title:** `feat: backfill validator over existing opportunities`
**Author of spec:** architect (Computer), 2026-06-10
**Reference style:** `docs/dev-notes/2026-06-10_devin-spec_opportunity-validation-guard.md`

---

## 1. Purpose

The opportunity validation guard (`opportunity_validation.ts`, merged in #784) runs at write-time only. It protects every NEW ingest going forward, but the 13,814 rows already in `opportunities` were written before the guard existed and contain known anomalies:

- 136 rows: `response_due_at < posted_at`
- 2 rows: due >10 years out
- 37 rows: `posted_at` >7 days in the future
- 115 rows: NAICS not 6-digit
- 156 rows: missing agency/agency_name/department_name

This PR runs the existing `validateAndRecompute` + `rejectReason` functions over every existing row, applies the diff, and produces a report.

**This is NOT a code change. It is a one-shot data-migration script that reuses the validator we already shipped.** No validator logic is touched. No new business rules. Pure replay of the deployed validator over historical data.

## 2. Scope (in / out)

**In scope:**

1. New script: `apps/backend-v3/scripts/backfill_validate_existing_opps.ts`
2. Two modes: `--dry-run` (default, prints diff, writes nothing) and `--apply` (commits)
3. Pipeline-protection guard: rows in `pipeline_items` get data normalization but are NEVER quarantined (preserves human pipeline decisions — see §5)
4. Batched processing (500 rows/batch) with per-batch transactions
5. Final summary report written to `apps/backend-v3/logs/backfill_<timestamp>.json`
6. New test: `apps/backend-v3/tests/scripts/backfill_validate_existing_opps.test.ts`

**Out of scope (do NOT do):**

- Any modification to `opportunity_validation.ts` (re-use as-is)
- Any modification to the source writers (`source_writer.ts`)
- Any schema migration (no new columns, no new tables)
- Backfilling the source-citation tables (`opportunity_*_sources`) — the validator doesn't touch those; this script doesn't either
- Any fix to govwin's missing-agency root cause (that's a govwin mapper fix, separate PR)
- Re-running the analysis worker on changed rows (separate concern — the validator can change a row's `naics` etc., but re-grading is the analysis worker's job and is out of scope for this PR)

## 3. Architectural pattern

Same defensive posture as the live writer: BEGIN per batch, COMMIT on success, ROLLBACK on any error within the batch, continue to the next batch. Every row's old and new value is logged. Pure pure-function replay — nothing in this script invents data.

## 4. Script structure

File: `apps/backend-v3/scripts/backfill_validate_existing_opps.ts`

**Imports:**
```typescript
import { validateAndRecompute, rejectReason, type OpportunityValidationFields } from '../src/ingest/framework/opportunity_validation.js';
import { pool } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';
import fs from 'fs';
import path from 'path';
```

**Entry point:**
```typescript
async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = !isApply;  // default: dry-run

  const startedAt = new Date().toISOString();
  logger.info({ isApply, startedAt }, 'backfill: starting');

  // ... see §5 for the loop
}

main().catch(err => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'backfill: fatal');
  process.exit(1);
});
```

**Run command (Devin: add to `apps/backend-v3/package.json` scripts):**
```json
"scripts": {
  "backfill:validate-opps": "tsx scripts/backfill_validate_existing_opps.ts"
}
```

Invocation:
- Dry-run: `npm run --workspace=apps/backend-v3 backfill:validate-opps`
- Apply: `npm run --workspace=apps/backend-v3 backfill:validate-opps -- --apply`

## 5. Main loop

```
1. SELECT COUNT(*) FROM opportunities WHERE deleted_at IS NULL → totalRows
2. For each batch of 500 rows ordered by id:
   a. SELECT * FROM opportunities WHERE deleted_at IS NULL AND id > :lastId ORDER BY id LIMIT 500
   b. BEGIN
   c. For each row in batch:
      - Construct `input: OpportunityValidationFields` from the row
      - Call `validated = validateAndRecompute(input)`
      - Call `xReason = rejectReason(validated)`
      - Compute `hasInPipeline = EXISTS (SELECT 1 FROM pipeline_items WHERE opportunity_id = row.id)`
      - Compute the diff (which fields changed; cf. §6)
      - If diff is empty AND xReason === null, skip (no-op)
      - Else, queue an update plan for this row
   d. If isApply:
      - For each queued update: UPDATE opportunities SET (changed fields) = (new values), updated_at = NOW() WHERE id = :id
      - If xReason !== null AND NOT hasInPipeline:
        UPDATE opportunities SET relevance_status = 'rejected', relevance_reason = :xReason WHERE id = :id
      - If xReason !== null AND hasInPipeline:
        Log a warn and DO NOT change relevance_status (preserve human pipeline decisions)
      - COMMIT
   e. Else (dry-run):
      - Log the diff per row to the report buffer
      - ROLLBACK (no writes)
3. Write the final report to `logs/backfill_<startedAt>.json` with:
   {
     "started_at": ...,
     "ended_at": ...,
     "mode": "dry-run" | "apply",
     "total_rows_scanned": N,
     "rows_unchanged": N,
     "rows_data_normalized": N,  // R1-R8 changes
     "rows_quarantined": N,        // X1-X2 hits applied
     "rows_skipped_quarantine_due_to_pipeline": N,  // X1-X2 hits NOT applied because human had committed pipeline decision
     "rule_breakdown": {
       "R1_due_before_posted_nulled": N,
       "R2_due_10y_out_nulled": N,
       "R3_posted_7d_future_nulled": N,
       "R4_value_swapped": N,
       "R5_value_out_of_range_nulled": N,
       "R6_bad_naics_nulled": N,
       "R7_agency_fallback_filled": N,
       "R8_set_aside_trimmed": N,
       "X1_no_title_no_description": N,
       "X2_stale_junk": N
     },
     "sample_diffs": [ ... first 20 row diffs for spot-checking ... ]
   }
```

## 6. Diff computation

Compare each field of `validated` against the original row. Track which rule fired by inspecting which fields changed (R1-R8 each touch specific fields, listed in `opportunity_validation.ts` comments).

For rule attribution, a simple approach:
- If `validated.response_due_at !== row.response_due_at` and `validated.response_due_at === null`:
  - If row had `response_due_at < posted_at` → R1
  - Else if row had `response_due_at > now + 10y` → R2
- If `validated.posted_at !== row.posted_at` and `validated.posted_at === null` → R3
- If `validated.value_min !== row.value_min` OR `validated.value_max !== row.value_max`:
  - Both nulled → R5
  - Swapped → R4
- If `validated.naics !== row.naics` → R6 (if nulled) or normalized whitespace (still count under R6)
- If `validated.agency !== row.agency` and original was null/empty → R7
- If `validated.set_aside !== row.set_aside` (trimmed-only) → R8

Per-row diff structure:
```typescript
{
  opportunity_id: number,
  rules_fired: string[],  // e.g. ['R1', 'R6']
  changes: {
    [field]: { old: any, new: any }
  },
  reject_reason: string | null,
  preserved_due_to_pipeline: boolean
}
```

## 7. Pipeline protection (§2 risk note)

The validator's `rejectReason` returns non-null for rows that (X1) have no title and no description, or (X2) have a due date >90 days in the past with no posted_at. Some of those rows may already have human-committed pipeline decisions (`pipeline_items` rows). For those, the human signaled "this is real and I'm working it" — overriding that with `relevance_status='rejected'` is wrong.

**Rule:** if `pipeline_items` row exists for an opp, NEVER set `relevance_status='rejected'`. Apply R1-R8 data normalizations as usual (those are fixes, not opinions), but skip X1/X2 quarantine. Log a warn for each such row so the human can review.

## 8. Pre-flight check (dry-run output)

The dry-run mode must produce a report the human (architect) can read in <5 minutes and approve. The report's `sample_diffs` array must include:

- 5 rows showing R1 (due<posted) fixes
- 5 rows showing R6 (bad NAICS) fixes
- 5 rows showing R7 (agency fallback) fills
- 5 rows showing X1 quarantine (if any)

If a category has fewer than 5 examples, include all of them. The architect uses this to confirm the validator is doing what's expected before --apply.

## 9. Tests

File: `apps/backend-v3/tests/scripts/backfill_validate_existing_opps.test.ts`

Required test cases (use testcontainer, seed the test DB with synthetic anomalies):

1. Dry-run does not write — seed 10 anomaly rows, run dry-run, verify all 10 are still anomalous in DB
2. Apply normalizes — seed an R1 row (due<posted), run --apply, verify response_due_at is now null
3. Apply quarantines — seed an X1 row (no title/desc), run --apply, verify relevance_status='rejected'
4. Pipeline protection — seed an X1 row WITH a `pipeline_items` row, run --apply, verify relevance_status is unchanged
5. Per-batch transaction isolation — inject a forced error mid-batch, verify the batch ROLLED BACK and the next batch proceeded
6. Report shape — verify the JSON report contains all required keys and the rule_breakdown counts match what was applied
7. Idempotency — run --apply twice in a row; the second run should report rows_unchanged === total_rows_scanned (no double-application)

## 10. Migration / CI

**No SQL migration in this PR.** Update `scripts/ci/migration-manifest.txt` is NOT needed (no new .sql files added).

CI gates required: same set as PR #784, plus the new test file under `Test` and `Integration Tests`.

Pre-existing failures NOT required to pass: `Compose Drift Check`, `LLM Router Gates (F-215 D4)`.

## 11. Architect review / apply workflow

This is a two-step deploy:

**Step 1 — Devin opens PR**

Devin writes the script + test, opens the PR. Architect reviews the code. Once approved and CI green:

**Step 2 — Squash-merge, run dry-run on the VPS**

After merge, the architect (NOT Devin) runs the script in dry-run mode against production:
```
ssh root@VPS 'cd /root/gda-command-v2 && docker compose -f docker-compose.prod.yml exec backend-v3 npm run --workspace=apps/backend-v3 backfill:validate-opps'
```

The architect downloads the report, validates the sample_diffs are reasonable, and shares a summary with Shawn. **Shawn approves --apply before any writes happen.**

**Step 3 — Apply (only after Shawn approves)**

Architect runs the same command with `-- --apply`. Final report is committed to the repo at `docs/dev-notes/backfill-reports/2026-06-XX_validate-opps_apply-report.json` for the audit trail.

## 12. Acceptance criteria

The architect will merge if and only if:

1. All required CI gates green
2. Script lives at the exact path in §4 and accepts `--apply` flag
3. Dry-run is the default behavior
4. Pipeline protection per §7 is enforced and tested
5. Report shape per §5 matches exactly (so the architect's tooling can parse it)
6. All 7 tests in §9 pass
7. No files outside the scope listed in §2 are modified

End of spec.
