# PR-A5 — Federal Org Hierarchy Normalization & Parse

Punchlist #29. Track A (make-it-work, P0). Depends on nothing; can ship independently of A2/A3/A4.

## Problem (verified live, 2026-06-08)

The federal organizational hierarchy is fully present in SAM.gov ingest data but is mislabeled and crammed into a single flat string, so the UI renders garbage (numeric codes as "department", and a long slash-delimited path as one unreadable field).

Verified column semantics on the live `opportunities` table for `data_source='sam.gov'` (8656 rows):

| Column | What it actually holds | Example |
|--------|------------------------|---------|
| `department` (text) | RAW SAM numeric code (`fullParentPathCode[0]`) | `097`, `017`, `021`, `036`, `057` |
| `agency` (text) | The ACTUAL top-level department NAME (`fullParentPathName[0]`) | `DEPT OF DEFENSE`, `HOMELAND SECURITY, DEPARTMENT OF`, `STATE, DEPARTMENT OF` |
| `sub_agency` (text) | The FULL slash-delimited org path below the top level | `DEPT OF THE NAVY / NAVSUP / NAVSUP WEAPON SYSTEMS SUPPORT / NAVSUP WSS MECHANICSBURG / ...` |
| `agency_subtype` (text) | mostly null | — |

Root cause is in `apps/backend-v3/src/ingest/sam/mapper.ts` (`mapSAMOpportunity`):
```
const orgParts = raw.fullParentPathName?.split('.') ?? [];
const agency = orgParts[0]?.trim() || null;                  // = department NAME
const subAgency = orgParts.slice(1).join(' / ').trim() || null; // = everything below, flattened
const department = raw.fullParentPathCode?.split('.')?.[0]?.trim() || null; // = numeric CODE
```
So `agency` gets the department name and `department` gets the numeric code — inverted/mislabeled — and the entire hierarchy below the department is flattened into `sub_agency`.

Secondary issue: `mapAgencyToDepartment` (`apps/backend-v3/src/lib/departmentMap.ts`) maps a name→cabinet-department, but is NOT applied to SAM rows (the mapper writes `department` directly to the numeric code, bypassing it). On the read path (`services/opportunities/index.ts` L133) the code is `row.department ?? mapAgencyToDepartment(row.agency)`, but because `row.department` is a non-null numeric code, the `??` fallback never fires, so the UI shows `097` instead of `Department of Defense`.

Non-SAM sources (`arxiv`=600, `grants_gov`=551, `nih`=204, `sbir`=167, `dod_rss`=36, plus `govwin`=155, `govtribe`=154) are smaller and several are non-federal/research; their org fields should NOT be force-parsed with the SAM path logic.

## Goal

Normalize federal org data into a clean, queryable hierarchy: **Department → Sub-Agency (Bureau) → Office → Contracting Office**, with human-readable values everywhere, while preserving the raw provenance string. Do NOT lose any existing data.

## Scope of changes

### 1. New normalized columns (additive migration)

New idempotent migration `apps/backend-v3/src/migration/sql/v3_064_org_hierarchy.sql` (and the matching path the repo uses for the migration runner — replicate the EXACT structure/naming of an existing recent migration like `v3_063`; add to BOTH migration directories if the repo keeps two, as v3_063 did). Add these columns to `opportunities` (all `TEXT NULL`, additive, no drops):

- `department_name` — clean top-level cabinet department (human readable, e.g. `Department of Defense`)
- `agency_name` — the sub-department / military department / bureau directly under the department (e.g. `Department of the Navy`, `U.S. Coast Guard`)
- `office` — the operational command/office in the middle of the path (e.g. `NAVSUP Weapon Systems Support`)
- `contracting_office` — the final buying office (last segment of the path, e.g. `NAVSUP WSS Mechanicsburg`)
- `org_path` — the full normalized slash-delimited path, kept for provenance/search

Keep existing `department`, `agency`, `sub_agency`, `agency_subtype` columns UNTOUCHED (do not drop; they remain raw provenance). Add a btree index on `department_name` and on `agency_name` (the two most likely group-by/filter dimensions). Migration must be idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

### 2. A reusable org-parse helper

Create `apps/backend-v3/src/lib/orgHierarchy.ts` exporting:

```
export interface ParsedOrg {
  department_name: string | null;
  agency_name: string | null;
  office: string | null;
  contracting_office: string | null;
  org_path: string | null;
}
export function parseFederalOrg(input: {
  agency?: string | null;        // raw agency col (dept name for SAM)
  sub_agency?: string | null;    // raw slash/dot path
  department?: string | null;    // raw (numeric code for SAM)
}): ParsedOrg
```

Logic:
- Build a single ordered list of path segments: start with the raw `agency` (top-level dept name), then split `sub_agency` on `/` (trim each, drop empties). Also strip any trailing parenthetical codes like `(00027)` / `(W6QK...)` from segment display values but DO keep the cleaned text.
- `department_name`: normalize segment[0] (the dept name) to a clean cabinet name. Use the existing `mapAgencyToDepartment` (departmentMap.ts) to map names like `DEPT OF DEFENSE`, `HOMELAND SECURITY, DEPARTMENT OF`, `STATE, DEPARTMENT OF` to `Department of Defense` / `Department of Homeland Security` / `Department of State`. If departmentMap returns `Independent Agency`, fall back to a title-cased version of segment[0].
- `agency_name`: segment[1] if present (e.g. `DEPT OF THE NAVY` → title-cased `Department of the Navy`; `US COAST GUARD` → `U.S. Coast Guard`), else null.
- `contracting_office`: the LAST segment (the actual buying office), title-cased, if there are ≥3 segments; if only 2 segments, contracting_office = segment[1] and office = null.
- `office`: the most meaningful middle segment — pick segment[-2] (second to last) when there are ≥4 segments, else null. (Goal: Department / Agency / Office / Contracting Office; collapse gracefully when fewer levels exist.)
- `org_path`: clean segments joined with ` / `.
- Title-casing: implement a small helper that handles ALL-CAPS SAM strings → Title Case, but preserves known acronyms (DOD, NAVSUP, AMC, ACC, MICC, NIH, CDC, FDA, FBI, DEA, ATF, FAA, NIST, NOAA, IRS, TSA, CBP, FEMA, USCG, VA) in uppercase. Keep a small ACRONYMS set.

Add focused unit tests `apps/backend-v3/tests/lib/orgHierarchy.test.ts` covering the 5 live examples above (Navy/NAVSUP, Coast Guard, State/Embassy Kuwait, Army/AMC/ACC chains) plus null/empty/single-segment inputs.

### 3. Apply at ingest time (SAM mapper)

In `apps/backend-v3/src/ingest/sam/mapper.ts`, after building `agency`/`subAgency`/`department` (keep those raw assignments unchanged for provenance), call `parseFederalOrg({ agency, sub_agency: subAgency, department })` and add the 5 parsed fields to the `OpportunityRow` object. Add the new fields to the `OpportunityRow` type in `apps/backend-v3/src/ingest/framework/source_writer.ts` and ensure the writer INSERT/UPSERT includes the 5 new columns (additive; ON CONFLICT update them too). Source-citation array: add a citation for `department_name` and `agency_name` pointing at the same `sourceUrl`.

ONLY apply this parse for federal sources. Gate it so non-federal sources (`arxiv`, `grants_gov`, `nih`, `sbir`, `dod_rss`) do NOT get SAM-path parsing — for those, leave the 5 new columns null (or set department_name from their own simple agency field if trivially available, but do not force the slash logic). The SAM mapper is SAM-only so this is automatically scoped there; for govwin (`ingest/govwin/job.ts`, which already calls mapAgencyToDepartment) also populate `department_name` from that mapping result and leave agency_name/office/contracting_office null unless govwin provides them.

### 4. Backfill existing rows

Add a one-time idempotent backfill in the migration runner path the repo already uses for data backfills (mirror how an existing backfill is wired — e.g. `scripts/backfill-unified-opportunities.ts` pattern, or an inline post-migration backfill if that is the established pattern). The backfill must:
- SELECT id, agency, sub_agency, department FROM opportunities WHERE data_source='sam.gov' AND department_name IS NULL
- For each, compute `parseFederalOrg(...)` and UPDATE the 5 new columns.
- Batch in chunks (e.g. 500) to avoid long transactions; log progress count.
- Be safe to re-run (only touches rows where department_name IS NULL).

Do NOT write a destructive update. Do NOT touch non-SAM rows in the backfill.

### 5. Read/serialize path

In `apps/backend-v3/src/services/opportunities/index.ts`:
- In `buildSummaryFromSources` (the `OpportunitySummary` builder ~L127), change `department` to prefer the clean value: `department: row.department_name ?? mapAgencyToDepartment(row.agency)` (NOT the raw numeric `row.department`). Add `agency_name: row.agency_name ?? row.agency ?? null`, `office: row.office ?? null`, `contracting_office: row.contracting_office ?? null` to the summary object.
- Add these fields to the `OpportunitySummary` TypeScript type (wherever it is declared) and to `getOpportunityById` consumers / the detail serializer so the opportunity detail view can show the full hierarchy.
- Ensure `createOpportunity` and `updateOpportunity` also populate the new columns via `parseFederalOrg` when agency/sub_agency are provided (so manual + edited opps stay consistent). Reuse the helper.

### 6. Frontend (minimal, in-scope)

Wherever the opportunity row/detail currently renders `department` (which today shows the numeric code) — render `department_name`. Where the detail shows the org, render a clean breadcrumb: `Department > Agency > Office > Contracting Office`, skipping null levels. Keep it small; do NOT build a new org-tree page in this PR (no such component exists today; that is out of scope). Just stop showing numeric codes and show the parsed breadcrumb on the opportunity detail and the list-row agency/department cell.

Make the department / agency breadcrumb segments use the existing agencyFilter mechanism if one exists for clickability (Track B handles deeper clickability — only wire what is trivially already supported; do not invent new filter endpoints here).

## Out of scope (do NOT do)
- No new org-hierarchy aggregation page or tree view.
- No new agency reference table.
- No dropping/renaming of existing columns.
- No changes to non-federal source mappers beyond leaving the new columns null.
- No relevance-gate work (that is PR-A4).

## CI / repo conventions (MUST follow)
- Migration must pass the **Migration Parity Check** (runs against the legacy-fixture DB `gda_migration_test`). Since this migration only ALTERs `opportunities` (which exists in the v3 baseline) it should be fine, but if any new test queries `opportunities`, ensure the test self-creates required tables in `beforeAll` (pattern: `apps/backend-v3/tests/migration/v3_026_unified_opportunities.test.ts`). Add the migration to BOTH migration dirs if the repo maintains two (v3_063 did).
- **Forbidden Visual Token check**: NO emojis, NO em-dashes anywhere in code, comments, or test strings. Use a regular hyphen or "to".
- Run lint + typecheck + existing tests locally; all ~30 CI checks must be green.
- Idempotent SQL only (`IF NOT EXISTS`). No data loss.
- Keep the diff tight and in-scope.

## Acceptance criteria
1. New migration applies cleanly and is idempotent (re-runnable).
2. After backfill, for `data_source='sam.gov'`: `department_name` is a clean cabinet name (e.g. `Department of Defense`, `Department of Homeland Security`), `agency_name` holds the bureau (e.g. `Department of the Navy`, `U.S. Coast Guard`), `contracting_office` holds the final buying office, `org_path` holds the clean full path. Zero rows show a numeric code in `department_name`.
3. The API opportunity summary + detail return `department_name`, `agency_name`, `office`, `contracting_office` (no numeric codes).
4. Frontend opportunity detail + list rows show the clean department name and a Dept > Agency > Office > Contracting Office breadcrumb, skipping null levels.
5. Non-SAM/non-federal rows are untouched (new columns null, no errors).
6. Unit tests for `parseFederalOrg` pass, covering the 5 live examples + edge cases.
7. All CI checks green.

## Branch / PR
Branch `feat/pr-a5-org-hierarchy`. PR title: `PR-A5: normalize federal org hierarchy (department/agency/office/contracting office)`. Reference punchlist #29 in the body.
