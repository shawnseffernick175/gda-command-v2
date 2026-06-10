# Devin Spec — Opportunity Override Capture (Learning Loop, Path A)

**Branch:** `feat/opp-override-capture` (base `main @ b69e10a`)
**PR Title:** `feat: Opportunity Override Capture (Path A learning loop)`
**Author of spec:** architect (Computer), 2026-06-10
**Reference style:** `docs/dev-notes/2026-06-10_devin-spec_opportunity-validation-guard.md`

---

## 1. Purpose

This PR captures **every human override of an AI-generated grade or pipeline stage** so we can:

1. See, in real time, where the AI is over- and under-grading opportunities
2. Build a labeled dataset of (AI prediction → human decision) pairs over weeks/months
3. Decide, later, whether to fine-tune prompts, retrain scoring, or change scoring rules (a follow-up PR — "Path B" — will use this dataset; this PR does NOT auto-tune anything)

**This is NOT a learning model. It is a data-collection scaffold.** No prompts change, no weights update, no model is retrained. The AI continues to score exactly as it does today. This PR captures the diff between what the AI said and what the human decided.

## 2. Scope (in / out)

**In scope:**

1. New table: `opportunity_decision_overrides`
2. Two new backend routes: `POST /v3/opportunities/:id/override-grade` and `POST /v3/opportunities/:id/override-stage`
3. Wire-in to existing grade-update and pipeline-stage-update paths so every override is captured
4. New backend route: `GET /v3/overrides/summary` for the dashboard
5. New frontend page: `/overrides` (in the existing dashboard navigation)
6. Reason field on both override actions (free-text, optional, capped at 500 chars)
7. Migration: `v3_072_opportunity_decision_overrides.sql`

**Out of scope (do NOT do):**

- Any auto-tuning, prompt mutation, or model retraining (this is "Path A" — capture only)
- Cross-source dedup, AI gap-filling, vault changes (separate PRs)
- Capturing overrides of fields other than grade and pipeline stage (P-Win, top drivers, etc. — leave those for a later PR)
- Backfill of historical overrides (we have no historical record of overrides; the dataset starts at deploy time, that's correct behavior)
- Any change to the analysis worker or scoring logic

## 3. Architectural pattern

Mirrors the existing `unified_opportunity_field_override_audit` table (which captures Vault unified-opp field overrides). Same shape, different scope: this one captures **grade + pipeline stage** specifically, and joins to the AI's prediction at decision time so we know exactly what the AI said when the human disagreed.

## 4. Data model

### 4.1 New table

File: `apps/backend-v3/migrations/v3_072_opportunity_decision_overrides.sql`

```sql
CREATE TABLE opportunity_decision_overrides (
  id                  BIGSERIAL PRIMARY KEY,
  opportunity_id      BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  field_name          TEXT NOT NULL,
  ai_value            TEXT,
  ai_confidence       NUMERIC,
  ai_evidence         JSONB,
  ai_model_version    TEXT,
  ai_generated_at     TIMESTAMPTZ,
  human_value         TEXT NOT NULL,
  set_by              TEXT NOT NULL DEFAULT 'admin',
  reason              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT opportunity_decision_overrides_field_name_check
    CHECK (field_name IN ('grade', 'pipeline_stage')),
  CONSTRAINT opportunity_decision_overrides_reason_length
    CHECK (reason IS NULL OR char_length(reason) <= 500)
);

CREATE INDEX idx_opp_decision_overrides_opp
  ON opportunity_decision_overrides(opportunity_id);
CREATE INDEX idx_opp_decision_overrides_field_created
  ON opportunity_decision_overrides(field_name, created_at DESC);
CREATE INDEX idx_opp_decision_overrides_ai_value
  ON opportunity_decision_overrides(field_name, ai_value, human_value);
```

**Field semantics:**

- `field_name`: hard-coded to `grade` or `pipeline_stage`. Other fields are out of scope (see §2).
- `ai_value`: the AI's prediction at the moment of override (e.g., `'F'` or `'no_bid'`). NULL if the AI had not yet scored when the override happened.
- `ai_confidence`: for grade overrides, copy `opportunity_analysis_cache.pwin` (0..1). For pipeline_stage, NULL (no equivalent today).
- `ai_evidence`: snapshot of `grade_evidence` (for grade) or NULL (for stage). JSONB allows future expansion.
- `ai_model_version`: copy `opportunity_analysis_cache.version` for grade overrides; NULL for stage.
- `ai_generated_at`: copy `opportunity_analysis_cache.generated_at` for grade overrides; NULL for stage.
- `human_value`: the new value the human set. For grade, one of A/B/C/D/F. For pipeline_stage, one of the 9 stages in `pipeline_items_stage_check`.
- `set_by`: defaults to `'admin'` (same as `vault_documents.uploaded_by`). When we wire real auth, this becomes the user id.
- `reason`: optional one-liner. UI exposes this; backend does not require it.

**Why a single table for both kinds of override (not two tables):** the dashboard query is much simpler with one table, and the field_name constraint enforces correct shape. Same precedent as `unified_opportunity_field_override_audit`.

### 4.2 No change to existing tables

`opportunities.grade` and `pipeline_items.stage` continue to be the source of truth for current value. The override table is **append-only audit** that joins back to the current row.

## 5. Backend routes

### 5.1 `POST /v3/opportunities/:id/override-grade`

**Request body:**
```json
{
  "new_grade": "B",
  "reason": "Incumbent contract expiring, agency relationship strong"
}
```

**Validation:**
- `:id` must be a valid opportunity id (404 if not found)
- `new_grade` must be one of `'A'|'B'|'C'|'D'|'F'` (400 if not)
- `reason` optional, max 500 chars (400 if longer)

**Behavior (in a single transaction):**

1. Read current `opportunities.grade` (call it `current_grade`) and the latest row from `opportunity_analysis_cache` for this opp ordered by `generated_at DESC` LIMIT 1
2. If `new_grade === current_grade`, return 200 with `{ noop: true }` — do NOT write to the override table for no-op overrides (avoids audit noise from accidental double-clicks)
3. INSERT into `opportunity_decision_overrides`:
   ```
   opportunity_id   = :id
   field_name       = 'grade'
   ai_value         = current_grade
   ai_confidence    = analysis_cache.pwin   (or NULL if no cache row)
   ai_evidence      = jsonb_build_object('grade_evidence', opportunities.grade_evidence)
   ai_model_version = analysis_cache.version   (or NULL)
   ai_generated_at  = analysis_cache.generated_at   (or NULL)
   human_value      = new_grade
   reason           = req.body.reason
   ```
4. UPDATE `opportunities.grade = new_grade, updated_at = NOW()` WHERE id = :id
5. Return `200 { success: true, override_id: <new row id> }`

**Concurrency:** wrap steps 1-4 in `BEGIN/COMMIT`. On error, ROLLBACK and return 500 with the standard error envelope.

### 5.2 `POST /v3/opportunities/:id/override-stage`

**Request body:**
```json
{
  "new_stage": "pursue",
  "reason": "AI marked no_bid but we have time and capacity"
}
```

**Validation:**
- `new_stage` must be one of the 9 valid stages in `pipeline_items_stage_check`

**Behavior:**

1. Look up the active `pipeline_items` row for this opp (`WHERE opportunity_id = :id` — there should be at most one; if zero, this is a fresh promote-to-pipeline and we create the row)
2. If a `pipeline_items` row exists, capture `current_stage = pipeline_items.stage`. If not, `current_stage = NULL`.
3. If `new_stage === current_stage`, return 200 with `{ noop: true }`
4. INSERT into `opportunity_decision_overrides`:
   ```
   opportunity_id   = :id
   field_name       = 'pipeline_stage'
   ai_value         = current_stage   (the stage the system had — note this is "the system's current value," not literally "what AI predicted." See §5.3)
   ai_confidence    = NULL
   ai_evidence      = NULL
   ai_model_version = NULL
   ai_generated_at  = NULL
   human_value      = new_stage
   reason           = req.body.reason
   ```
5. UPSERT `pipeline_items` (INSERT if no row, UPDATE if exists) setting `stage = new_stage, updated_at = NOW()`
6. Return `200 { success: true, override_id: <id> }`

### 5.3 Honest semantic note for stage overrides

For grade, the AI literally writes the value into `opportunities.grade`. For pipeline stage, the AI's contribution is the **auto-no-bid rule** (in `analysis.ts`) that sets stage to `'no_bid'` when due is <30 days. Other stage transitions today are 100% human. So `ai_value` in stage-override rows captures **the system's previous value**, which is sometimes the AI's auto-no-bid decision and sometimes a previous human decision. Both are interesting data; the dashboard query (§6) groups by whether the previous value came from auto-no-bid by checking `ai_generated_at IS NULL`, which it always is for stage rows — so for stage, we look at the `created_by` and `created_at` of the prior pipeline_items row separately. This is documented in `docs/dev-notes/` (see §10).

This is not a bug — it's the honest answer to "what did the system say before the human disagreed." When Path B (auto-tuning) ships, we will revisit whether to separately track the auto-no-bid trigger.

### 5.4 `GET /v3/overrides/summary`

Returns aggregated counts for the dashboard. No request body.

**Response:**
```json
{
  "success": true,
  "data": {
    "totals": {
      "grade_overrides": 47,
      "stage_overrides": 23,
      "all_time": 70,
      "last_7d": 12,
      "last_30d": 38
    },
    "grade_pivot": [
      { "ai_value": "F", "human_value": "A", "count": 3 },
      { "ai_value": "F", "human_value": "B", "count": 8 },
      { "ai_value": "F", "human_value": "C", "count": 11 },
      { "ai_value": "A", "human_value": "F", "count": 1 },
      ...
    ],
    "stage_pivot": [
      { "ai_value": "no_bid", "human_value": "pursue", "count": 6 },
      { "ai_value": "no_bid", "human_value": "qualify", "count": 4 },
      ...
    ],
    "agreement_rate": {
      "grade_pct": 88.4,
      "stage_pct": 91.2,
      "notes": "Agreement = (total opportunities scored) - (distinct opportunities with grade override) / (total opportunities scored). Same formula for stage."
    },
    "top_disagreement_naics": [
      { "naics": "541512", "count": 9, "most_common": "F→C" },
      { "naics": "541330", "count": 6, "most_common": "F→B" }
    ],
    "top_disagreement_agency": [
      { "agency": "Defense Information Systems Agency", "count": 11 },
      { "agency": "Department of the Navy", "count": 7 }
    ],
    "recent": [
      {
        "id": 1234,
        "opportunity_id": 88421,
        "opportunity_title": "Cybersecurity Support Services",
        "field_name": "grade",
        "ai_value": "F",
        "human_value": "B",
        "reason": "Incumbent expiring, strong relationship",
        "created_at": "2026-06-10T20:14:33.000Z"
      }
      // ... up to 25 most recent
    ]
  },
  "meta": { ... standard meta envelope }
}
```

**SQL for the pivots:**

```sql
-- grade_pivot
SELECT ai_value, human_value, COUNT(*)::int AS count
FROM opportunity_decision_overrides
WHERE field_name = 'grade' AND ai_value IS NOT NULL
GROUP BY ai_value, human_value
ORDER BY count DESC;

-- stage_pivot — same pattern, WHERE field_name = 'pipeline_stage'

-- top_disagreement_naics
SELECT o.naics, COUNT(*)::int AS count,
       MODE() WITHIN GROUP (ORDER BY (odo.ai_value || '→' || odo.human_value)) AS most_common
FROM opportunity_decision_overrides odo
JOIN opportunities o ON o.id = odo.opportunity_id
WHERE odo.field_name = 'grade' AND o.naics IS NOT NULL
GROUP BY o.naics
ORDER BY count DESC
LIMIT 10;

-- top_disagreement_agency — same shape, GROUP BY o.agency
```

## 6. Frontend

### 6.1 New page

File: `packages/frontend-v3/src/app/overrides/page.tsx`

**Route:** `/overrides`

**Navigation:** add a link in the existing sidebar between "Vault" and "Pipeline" — the existing nav config lives in (Devin: locate the sidebar nav component yourself; do NOT hardcode a new sidebar file. Add ONE entry to the existing nav array.)

**Layout (top to bottom):**

1. **Header** — "Override Audit" + last-7d / last-30d / all-time toggle (default: last-30d)
2. **KPI strip** — 4 cards in a horizontal row:
   - Total Overrides (count)
   - Grade Agreement Rate (% — "the AI's grade matched yours")
   - Stage Agreement Rate (%)
   - Most Common Disagreement (e.g. "F→C: 11 times")
3. **Grade pivot table** — rows = AI grade, columns = human grade, cell = count. Diagonal cells (A→A, B→B, etc.) shaded green; off-diagonal shaded yellow/red proportional to magnitude.
4. **Stage pivot table** — same shape for pipeline stages.
5. **Top 10 NAICS where AI disagreed most** — bar chart, horizontal, count + most-common transition label per bar.
6. **Top 10 Agencies where AI disagreed most** — same shape.
7. **Recent overrides feed** — 25 most-recent, sortable by date. Each row: timestamp · opportunity title (linked) · field (grade/stage) · "AI: X → You: Y" · reason (truncated).

**Visual rules:**
- Use existing `useApi` hook for `/v3/overrides/summary`
- Match existing dashboard aesthetic (see `packages/frontend-v3/src/app/dashboard/page.tsx`). No new color tokens. No JetBrains Mono.
- All numbers should render `—` (em dash) if zero, never blank
- The toggle between last-7d / last-30d / all-time can be implemented client-side by making the same API request 3 times (cheap query) or by passing a `?range=` query param — Devin's choice, but match whichever pattern the existing dashboard uses

### 6.2 Wire-in to existing opportunity detail page

In `packages/frontend-v3/src/app/opportunities/[id]/page.tsx` (or wherever grade is currently shown editable):

- The grade pill, when clicked, should open a dropdown / modal to pick a new grade
- On change, call `POST /v3/opportunities/:id/override-grade` with `{ new_grade, reason }` — reason is an optional textarea
- Same pattern for stage on the pipeline view

**If today there is no UI to change grade or stage directly:** locate the existing place where grade is displayed, add an edit affordance (small pencil icon, click → modal). Stage edit already exists in the pipeline kanban — wire that to the new route. Devin: do NOT redesign these UIs; just wire the edit action to the new POST routes.

## 7. Wire-in: capture overrides made through OTHER paths

There may be other places in the codebase where `opportunities.grade` or `pipeline_items.stage` is updated directly (e.g., bulk-edit, admin tools). For this PR:

- **Grep the backend for `UPDATE opportunities SET grade`** and **`UPDATE pipeline_items SET stage`**
- For each occurrence outside of the new override routes and outside of the analysis worker (which writes the AI's own grade), refactor to call the override route or its underlying service function
- If a call site cannot be safely refactored in this PR (e.g., it's deep in a worker), leave a `// TODO(override-capture): route through override service` comment and list it in the PR description

The analysis worker continues to write grades directly — those are the AI's predictions, not overrides.

## 8. Tests

File: `apps/backend-v3/tests/routes/override.test.ts`

**Required test cases:**

1. POST grade override happy path — table row written with all expected fields populated
2. POST grade override when no `opportunity_analysis_cache` row exists — `ai_confidence`, `ai_model_version`, `ai_generated_at` NULL; row still inserted
3. POST grade override with `new_grade === current_grade` — returns `{ noop: true }`, no row written
4. POST grade override with invalid grade — 400, no row written
5. POST grade override with reason > 500 chars — 400, no row written
6. POST grade override with nonexistent opp id — 404
7. POST stage override happy path with existing `pipeline_items` row
8. POST stage override happy path with NO existing `pipeline_items` row — creates the row
9. POST stage override with invalid stage — 400
10. POST stage override no-op
11. GET `/v3/overrides/summary` returns the expected shape with zero overrides (all counts 0, arrays empty)
12. GET `/v3/overrides/summary` after seeding 5 grade overrides — pivot counts correct
13. Migration test: `v3_072` applies cleanly, table exists, all 3 indexes exist, constraints enforce field_name and reason length

Use the existing testcontainer fixture (see `apps/backend-v3/tests/setup/postgres-testcontainer.ts` or equivalent — match the pattern in `tests/ingest/opportunity_validation.test.ts`).

## 9. Migration

Place at `apps/backend-v3/migrations/v3_072_opportunity_decision_overrides.sql`.

After adding, run:
```
ls apps/backend-v3/migrations/*.sql | xargs -n1 basename | sort > scripts/ci/migration-manifest.txt
```
and commit the manifest update in the same commit (this is required by the V3 Schema Drift Check CI gate — see `2026-06-07_bug-punchlist.md` entry #16).

## 10. Documentation

Add `docs/dev-notes/2026-06-10_override-capture-design.md` (NEW) with:

1. The purpose of override capture (one paragraph from §1)
2. The semantic note from §5.3 about what `ai_value` means for stage rows
3. A small SQL recipe section: "How to find AI-graded F opps that you pursued" (this is the kind of query you'll actually run weekly)
4. A note that this is "Path A" — Path B (auto-tuning) will land in a later PR and will consume from `opportunity_decision_overrides`

## 11. CI gates

This PR must pass:

- `Build & Typecheck`
- `Test` (incl. the 13 new tests)
- `Integration Tests (Postgres testcontainer)`
- `V3 Migration Smoke Test`
- `V3 Schema Drift Check` (migration manifest must be updated — see §9)
- `Migration Parity Check`
- `V3 Contract Tests` (the 2 new routes need contract entries — see existing route contracts pattern)
- `Forbidden Visual Token Check`, `R2 forbidden token scan`, `V3 Drift Detector Negative Test`, `No Phantom Backend`, `No root binaries`, `MCP Server resolve check`, `Dependency Audit`, `Gate self-test`

NOT required to pass (pre-existing failures on main, unrelated):
- `Compose Drift Check`
- `LLM Router Gates (F-215 D4)`

If a check listed as required fails for reasons unrelated to this PR (e.g., a flaky test), document it in the PR description and tag the architect; do NOT silence it.

## 12. Out-of-scope reminders

- No auto-tuning, no prompt updates, no model retraining
- No backfill — dataset starts at deploy
- No P-Win / top-driver / doctrine-score overrides yet
- No multi-user auth — `set_by` defaults to `'admin'`

## 13. Acceptance criteria for architect review

The architect will merge if and only if:

1. All required CI gates green
2. Table created with the exact schema in §4.1
3. Both POST routes behave per §5 (verified by tests + manual probe)
4. GET summary route returns the shape in §5.4 (verified by tests)
5. Frontend page renders with zero overrides (empty state) and with seeded overrides
6. No file outside the scope listed in §2 is modified
7. The semantic note from §5.3 appears in the new doc

End of spec.
