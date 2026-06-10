# Devin Spec — Opportunity Ingest Validation Guard

Date: 2026-06-10
Author: Shawn (via Perplexity architect)
Branch: `feat/opp-validation-guard`
Base: `main @ cd87df5`
PR target: single PR to `main`, additive only

## Why this exists

Today, opportunity ingest writes whatever the mapper hands it. The financials path
recently grew a 4-layer "deterministic self-validation" structure
(`apps/backend-v3/src/services/financials/ingest.ts`) — model extracts raw, plain
code recomputes derived values, plain code rejects implausible rows. We are
applying the **same defensive pattern** to opportunities, retargeted to the real
threat model (mapper-level silent drift, not AI hallucination — there is no AI
extraction in the current opportunity path).

## Live data anomalies this guard would catch right now

Probed `opportunities WHERE deleted_at IS NULL` on prod (`gda_command_staging`,
2026-06-10):

| Anomaly | Rows | Affected sources |
|---|---:|---|
| `response_due_at < posted_at` | 136 | sam.gov |
| `response_due_at > now + 10y` (parse junk) | 2 | sam.gov |
| `posted_at > now + 7d` (parse junk) | 37 | sam.gov |
| `naics` not matching `^\d{6}$` | 115 | sam.gov |
| No agency / agency_name / department_name | 156 | govwin (all 155) + 1 |
| Title null / empty / "Untitled" | 0 | — |
| No idempotency key | 0 | — |

These are real, addressable; the guard turns them into either a corrected row, a
nulled-field row with a warning, or a rejected row with an audit trail.

## Threat model honesty

There is currently no AI extraction in opportunity ingest. Mappers read structured
source APIs deterministically. The threat is therefore:

- mapper-level date / currency parse errors,
- vocabulary drift across sources (set-aside, agency names),
- source-side bad data (NAICS not actually 6 digits, due-before-posted, etc.),
- a future ingest path that DOES use AI extraction inheriting the same guard for
  free.

This is **mirroring** the financials pattern, not coupling to it. The same two
public functions (`validateAndRecompute`, `rejectReason`) with the same Layer 2 /
Layer 3 contract.

## Scope of changes

### File 1 — `apps/backend-v3/src/ingest/framework/opportunity_validation.ts` (NEW)

Two pure functions. No DB access. No throws. Generic over BOTH row shapes
(`OpportunityRow` for SAM, `ExternalOpportunityRow` for everything else),
operating on the SHARED subset of fields. Mirrors the contract of
`src/services/financials/ingest.ts:validateAndRecompute` / `:rejectReason`.

```ts
/**
 * Opportunity ingest validation guard.
 *
 * Pure functions, no DB access. Layer 2 recomputes/normalizes mapper output.
 * Layer 3 returns a reject reason string when the row carries no usable
 * signal or is internally inconsistent. Never throws; never fabricates.
 *
 * Mirrors the financials pattern in services/financials/ingest.ts so every
 * ingest path enforces the same "extract → recompute/normalize → reject if
 * impossible" contract.
 *
 * The guard is generic over OpportunityRow (SAM) and ExternalOpportunityRow
 * (every other source); idempotency keys (sam_notice_id vs external_id) are
 * guaranteed by the row types themselves and therefore NOT re-checked here.
 */

import { logger } from '../../lib/logger.js';

/**
 * Shared subset of fields the validator reads or rewrites. Both
 * OpportunityRow and ExternalOpportunityRow extend this; the validator is
 * generic so it works on either without two copies.
 */
export interface OpportunityValidationFields {
  title: string;
  description: string | null;
  data_source: string;
  agency: string | null;
  agency_name?: string | null;
  department_name?: string | null;
  office?: string | null;
  naics: string | null;
  set_aside: string | null;
  value_min: number | null;
  value_max: number | null;
  response_due_at: string | null;
  posted_at: string | null;
  tags: string[];
  // Optional contextual identifiers used only in log lines:
  sam_notice_id?: string;
  external_id?: string;
}

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_TRILLION = 1_000_000_000_000;
const NAICS_RE = /^[0-9]{6}$/;

function parseISO(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isPlainStringWithContent(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

/**
 * Layer 2 — deterministic recompute / normalize. The mapper EXTRACTS; this
 * function VERIFIES and NORMALIZES before the row is persisted.
 *
 * Behavior contract:
 * - Never throws.
 * - Never fabricates a value from nothing (no "best guess" agencies, NAICS, etc).
 * - Logs a warn on every override (the "mapper drift caught" signal).
 * - Returns a NEW row; does not mutate the input.
 *
 * Rules (each independently testable):
 *   R1 dates: response_due_at must be >= posted_at; if violated, null
 *      response_due_at + warn.
 *   R2 dates: response_due_at more than 10 years in the future is a parse
 *      artifact; null + warn.
 *   R3 dates: posted_at more than 7 days in the future is a parse artifact;
 *      null + warn (only posted_at; response_due_at far-future is normal).
 *   R4 dollars: if value_min > value_max, swap + warn.
 *   R5 dollars: negative or >= $1T value is fake; null both + warn.
 *   R6 NAICS: must match /^[0-9]{6}$/ after trim; if not, null + warn.
 *      Preserve the raw bad value in tags as `bad_naics:<raw>` for audit.
 *   R7 agency fallback: if agency is null/empty, fall back through
 *      agency_name -> department_name -> office, copying the first non-empty
 *      value into agency. Does NOT touch the source field. Warn when a
 *      fallback fired so we can fix mapper at source.
 *   R8 set_aside: trim + collapse internal whitespace; do NOT translate
 *      vocabulary here (that is a separate canonical-vocab problem, out of
 *      scope; flag-only).
 */
export function validateAndRecompute<T extends OpportunityValidationFields>(opp: T): T {
  const out: T = { ...opp, tags: [...(opp.tags ?? [])] };
  const ctx = {
    data_source: out.data_source,
    sam_notice_id: out.sam_notice_id ?? null,
    external_id: out.external_id ?? null,
  };
  const now = Date.now();

  // R1 / R2 / R3 — dates
  const dueAt = parseISO(out.response_due_at);
  const postedAt = parseISO(out.posted_at);
  if (postedAt !== null && postedAt.getTime() > now + SEVEN_DAYS_MS) {
    logger.warn({ ...ctx, posted_at: out.posted_at }, 'opp validator: posted_at >7d in future, nulled');
    out.posted_at = null;
  }
  if (dueAt !== null && dueAt.getTime() > now + TEN_YEARS_MS) {
    logger.warn({ ...ctx, response_due_at: out.response_due_at }, 'opp validator: response_due_at >10y out, nulled');
    out.response_due_at = null;
  } else if (dueAt !== null && postedAt !== null && dueAt.getTime() < postedAt.getTime()) {
    logger.warn(
      { ...ctx, response_due_at: out.response_due_at, posted_at: out.posted_at },
      'opp validator: response_due_at < posted_at, response_due_at nulled',
    );
    out.response_due_at = null;
  }

  // R4 / R5 — dollars
  const vmin = out.value_min;
  const vmax = out.value_max;
  if (vmin !== null && vmax !== null && vmin > vmax) {
    logger.warn({ ...ctx, value_min: vmin, value_max: vmax }, 'opp validator: value_min > value_max, swapped');
    out.value_min = vmax;
    out.value_max = vmin;
  }
  for (const k of ['value_min', 'value_max'] as const) {
    const v = out[k];
    if (v !== null && (v < 0 || v >= ONE_TRILLION)) {
      logger.warn({ ...ctx, field: k, value: v }, 'opp validator: value out of range, nulled both');
      out.value_min = null;
      out.value_max = null;
      break;
    }
  }

  // R6 — NAICS
  if (isPlainStringWithContent(out.naics)) {
    const naics = out.naics.trim();
    if (!NAICS_RE.test(naics)) {
      logger.warn({ ...ctx, naics: out.naics }, 'opp validator: naics not 6-digit, nulled (raw preserved in tags)');
      if (!out.tags.includes(`bad_naics:${naics}`)) out.tags.push(`bad_naics:${naics}`);
      out.naics = null;
    } else {
      out.naics = naics;
    }
  }

  // R7 — agency fallback
  if (!isPlainStringWithContent(out.agency)) {
    const fallback =
      (isPlainStringWithContent(out.agency_name) && out.agency_name) ||
      (isPlainStringWithContent(out.department_name) && out.department_name) ||
      (isPlainStringWithContent(out.office) && out.office) ||
      null;
    if (fallback) {
      logger.warn({ ...ctx, fallback_source: fallback }, 'opp validator: agency empty, filled from fallback chain');
      out.agency = fallback;
    }
  }

  // R8 — set_aside whitespace normalization
  if (isPlainStringWithContent(out.set_aside)) {
    out.set_aside = out.set_aside.trim().replace(/\s+/g, ' ');
  }

  return out;
}

/**
 * Layer 3 — storability guard. Returns a reject reason or null. Never throws.
 * Operates on the post-validate row. Rejected rows are NOT silently dropped;
 * caller writes them with `relevance_status='rejected'` and the reason in
 * `relevance_reason` so a human can audit (see source_writer wire-in).
 *
 * Idempotency-key check is NOT here: both row types enforce a required key
 * (sam_notice_id or external_id) at the type level, so a row missing one
 * cannot reach this function.
 *
 *   X1 no title (null/empty/"Untitled") AND no description.
 *   X2 stale-junk: response_due_at > 90 days in the past AND posted_at is null.
 */
export function rejectReason(opp: OpportunityValidationFields): string | null {
  const hasTitle = isPlainStringWithContent(opp.title) && opp.title.trim() !== 'Untitled';
  const hasDescription = isPlainStringWithContent(opp.description);
  if (!hasTitle && !hasDescription) {
    return 'no title and no description';
  }

  const dueAt = parseISO(opp.response_due_at);
  const postedAt = parseISO(opp.posted_at);
  if (dueAt !== null && postedAt === null && dueAt.getTime() < Date.now() - NINETY_DAYS_MS) {
    return 'response_due_at >90 days in the past with no posted_at (stale junk)';
  }

  return null;
}
```

### File 2 — `apps/backend-v3/src/ingest/framework/source_writer.ts` (EDIT)

Wire the validator + reject pass into BOTH entry points: `upsertOpportunityWithSources` (SAM) AND `upsertExternalOpportunity` (everything else). The pattern is identical in both; only the row-type alias and the references differ. Exact diff for `upsertOpportunityWithSources` (anchored on current main, file lines 122–145):

```diff
@@ src/ingest/framework/source_writer.ts
   import { mirrorOpportunityToUnified } from '../../services/opportunities/unified-mirror.js';
   import { evaluateRelevance } from '../../constants/relevance.js';
+  import { validateAndRecompute, rejectReason } from './opportunity_validation.js';
@@ export async function upsertOpportunityWithSources(
   opp: OpportunityRow,
   citations: SourceCitation[],
   sourceKind: string,
 ): Promise<UpsertOutcome> {
   const client = await pool.connect();
   try {
     await client.query('BEGIN');

+    // Layer 2 — deterministic recompute / normalize. Pure, no DB.
+    const validated = validateAndRecompute(opp);
+
+    // Layer 3 — storability guard. Rejected rows go in with relevance_status
+    // = 'rejected' + the reason in relevance_reason for human audit, then we
+    // skip every other side effect (no contacts, no analysis enqueue, no
+    // unified mirror).
+    const xReason = rejectReason(validated);
+
     const sourceUrl = citations[0]?.source_url ?? null;
     const { rows: sourceRows } = await client.query(
       `INSERT INTO sources (kind, url, title, confidence, meta)
        VALUES ($1, $2, $3, 'high', '{}')
        RETURNING id`,
-      [sourceKind, sourceUrl, `SAM.gov Notice ${opp.sam_notice_id}`],
+      [sourceKind, sourceUrl, `SAM.gov Notice ${validated.sam_notice_id}`],
     );
     const sourceId = sourceRows[0].id;

     // PR-A4: evaluate relevance before upsert
-    const rel = evaluateRelevance({
-      naics: opp.naics,
-      set_aside: opp.set_aside,
-      response_due_at: opp.response_due_at,
-    });
+    const rel = xReason !== null
+      ? { status: 'rejected', reason: xReason }
+      : evaluateRelevance({
+          naics: validated.naics,
+          set_aside: validated.set_aside,
+          response_due_at: validated.response_due_at,
+        });
+
+    if (xReason !== null) {
+      logger.warn(
+        { sam_notice_id: validated.sam_notice_id, govtribe_id: validated.govtribe_id, reason: xReason },
+        'opportunity row rejected by validation guard (stored with relevance_status=rejected)',
+      );
+    }
```

Then the existing `INSERT INTO opportunities (…) VALUES (…)` block changes every
`opp.<field>` reference to `validated.<field>`. **Mechanical rename only inside
that VALUES list and the contacts upsert below it.** Search and replace within
the function body, do not touch anywhere else.

After the COMMIT, skip side effects when `xReason !== null`:

```diff
     await client.query('COMMIT');

-    // Upsert contacts outside the opportunity transaction so a bad
-    // contact never rolls back the opportunity write.
-    if (opp.contacts && opp.contacts.length > 0) {
-      await upsertContactsForOpportunity(oppId, opp.data_source, opp.contacts);
-    }
-
-    // F-605: auto-enqueue analysis on ingest
-    enqueueIngestAnalysis(String(oppId));
-
-    // F-401: mirror into unified_opportunities (best-effort, never fails ingest)
-    try {
-      await mirrorOpportunityToUnified(pool, {
+    if (xReason === null) {
+      if (validated.contacts && validated.contacts.length > 0) {
+        await upsertContactsForOpportunity(oppId, validated.data_source, validated.contacts);
+      }
+      enqueueIngestAnalysis(String(oppId));
+      try {
+        await mirrorOpportunityToUnified(pool, {
+          /* fields, all from `validated` */
+        });
+      } catch (err) {
+        logger.warn({ err, oppId }, 'unified mirror failed (non-fatal)');
+      }
+    }
```

(`OpportunityRow` already carries every field we touch — no schema change needed.)

**Repeat the EXACT SAME wire-in for `upsertExternalOpportunity`** (file lines 291–470): import is already done at the top of the file; add the same `validated = validateAndRecompute(opp)` + `xReason = rejectReason(validated)` block at the same position (right after `BEGIN`, before the `sources` insert), substitute `validated` for `opp` inside the VALUES list and the mirror call, and gate the post-COMMIT side effects on `xReason === null`. The only difference is there is no `contacts` write in the External path, so just the analyze-enqueue and the unified-mirror need gating.

Do NOT abstract the two functions into one — they have meaningfully different INSERT shapes and ON CONFLICT clauses; the duplication is intentional and survives this PR unchanged.

### File 3 — `apps/backend-v3/tests/ingest/opportunity_validation.test.ts` (NEW)

Vitest-style tests for every R-rule and X-rule. Each test owns one rule, one
assertion. Uses an inline `makeRow(): OpportunityValidationFields` helper with
sensible defaults; each test overrides just the fields under test. ~22 cases:

- R1: due before posted -> due nulled, posted preserved.
- R2: due 11y out -> due nulled.
- R3: posted 8d in future -> posted nulled.
- R4: vmin=100, vmax=10 -> swap to vmin=10, vmax=100.
- R5: vmin=-5 -> both nulled.
- R5: vmax=2e12 -> both nulled.
- R6: naics='12345' -> nulled, tags includes 'bad_naics:12345'.
- R6: naics=' 541330 ' -> trimmed to '541330'.
- R7: agency='', agency_name='Air Force' -> agency becomes 'Air Force'.
- R7: agency='', agency_name='', department_name='DoD' -> agency becomes 'DoD'.
- R7: every fallback empty -> agency stays null, no throw.
- R8: set_aside='  Total   Small Business  ' -> 'Total Small Business'.
- X1: title='', description='' -> rejected with reason 'no title and no description'.
- X1: title='Untitled', description=null -> rejected.
- X1: title='Untitled', description='real text' -> NOT rejected.
- X2: due 100 days ago, posted null -> rejected.
- X2: due 100 days ago, posted present -> NOT rejected.
- Generic: validateAndRecompute accepts ExternalOpportunityRow-shaped input
  (with external_id, agency_subtype, etc.) and returns the SAME shape.
- Invariant: validateAndRecompute does not mutate the input.
- Invariant: validateAndRecompute never throws on any field permutation
  (table-test with null/undefined/empty/garbage for every field).
- Invariant: rejectReason never throws.

### Out of scope (do NOT do in this PR)

- govwin agency mapping. Govwin has no mapper.ts and all 155 rows have empty
  agency/department/office/org_path. That is a separate mapper PR (recommend
  a follow-up after this lands), not a validator concern. R7 fallback will
  still produce null for govwin and that is correct — we cannot fabricate.
- Canonical set_aside vocabulary mapping. The teaming mapping already lives in
  `services/pwin/feature-extraction.ts:TEAMING_REQUIRED_PATTERNS` and is the
  correct home for vocabulary translation. Whitespace-only normalization here.
- Tests for the existing financials validator. Strongly recommended as a
  follow-up but separate scope.

## Acceptance criteria

CI green:
- `npm test --workspace=@gda/backend` passes.
- ESLint clean. No new `any` types.
- New file has the same prettier/eslint rules as the rest of the repo.

Manual verification against prod data after deploy (architect step):
- Re-run the live data-quality probe (see "Live data anomalies" table above).
  Expect counts to drop on next full ingest cycle as each anomalous row is
  either corrected (R1–R8 apply) or moved to `relevance_status='rejected'`
  with a populated `relevance_reason` (X1/X2).
- Tail backend logs during the next SAM ingest run:
  `docker logs gda-backend-v3 --since 1h | grep 'opp validator:'` — expect
  warnings for the 136 due-before-posted, 2 due-10y-out, 37 posted-future,
  and 115 bad-naics rows on first re-ingest.
- Row count: `SELECT COUNT(*) FROM opportunities WHERE relevance_status='rejected';`
  before merge: 0 (column exists, no rejector wired). After deploy + one ingest
  cycle: a small positive number for any X1/X2 hits.

## Non-goals

- Performance. The validator is O(1) per row; no measurable impact on a 5k-row
  ingest.
- Backfill. Existing 13k rows are not re-validated by this PR. If we want a
  one-shot backfill, that is a separate maintenance script.

## Branch + PR conventions

- Branch: `feat/opp-validation-guard`.
- Single PR to `main`. Additive only (no column drops, no behavior change for
  passing rows).
- Squash-merge after architect review + CI green.

## Architect TODO when PR opens

1. Diff against this spec line by line: file 1 verbatim, file 2 wire-in matches,
   tests cover all R/X rules.
2. CI green (Forbidden Token Scan, Contract Tests, Migration Smoke not affected,
   Lighthouse not affected — no UI changes).
3. Squash-merge, deploy backend-v3, tail logs for `opp validator:` warnings
   during the next ingest run, run the verification SQL above.
4. Note the result in `docs/dev-notes/2026-06-07_bug-punchlist.md` as a new
   resolved item.

---

End of spec.
