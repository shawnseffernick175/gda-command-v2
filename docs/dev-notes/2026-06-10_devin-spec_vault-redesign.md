# Devin Spec — Vault Redesign (Buckets, Upload Routing, AI-Ingested Indicator)

**Branch:** `feat/vault-redesign` (base `main`)
**PR Title:** `feat(vault): explicit bucket routing + upload-time selection + AI-ingested indicator`
**Author of spec:** architect (Computer), 2026-06-10
**Reference style:** `docs/dev-notes/2026-06-10_devin-spec_opportunity-validation-guard.md`

---

## 1. Purpose

User feedback (paraphrased): "Need a dropdown when uploading a document for which bucket the document should go to. Across the top, those buckets should be listed. Financials should not be under Other. When AI has reviewed and ingested it, show a check mark or something so I know it was done."

This PR delivers three changes:

1. **17 explicit buckets** (alphabetical, flat) replacing the current 11 work_product + 12 regulatory split that lumps financials into `other`.
2. **Upload-time bucket dropdown** on the existing UploadModal so the user picks the bucket BEFORE the file is sent (no more relying on AI inference alone for routing).
3. **AI-ingested checkmark** on every row in the document list — a green check when `ai_summary` is populated and `ai_tags` is non-empty, a gray pending indicator otherwise.

**This is a UI + tiny backend change. No AI prompt logic is altered. No new ML models. The check_constraint and DOC_TYPES tuple are widened. The frontend gets a dropdown.**

## 2. Scope (in / out)

**In scope:**

1. Database migration: widen `vault_documents_doc_type_check` to add the new bucket values listed in §3.
2. Backend: update `apps/backend-v3/src/routes/vault.ts` doc_type validation (whatever enum/check it uses) to accept the new list.
3. Frontend: update `packages/frontend-v3/src/app/vault/page.tsx`:
   - Extend `DOC_TYPES` tuple and `DOC_TYPE_LABELS` map.
   - Add bucket dropdown to the UploadModal (required field, defaults to `other` if user leaves blank — same behavior as today).
   - Add AI-ingested column to the document list table (green check when `ai_summary` and `ai_tags` are populated; gray hourglass otherwise).
   - Update the top-of-page filter chips (`docTypeFilter`) to show all 17 buckets, alphabetically.
4. Auto-migrate existing rows with high-confidence reclassification — see §5.
5. Tests for: new buckets accepted, upload-with-bucket flow, auto-migration helper, AI-ingested badge logic.

**Out of scope (do NOT do):**

- Any change to AI summarization/tagging pipeline (`extracted_text` ingestion runs as-is).
- Any change to vault upload size limits or storage backend.
- Any change to `regulatory_*` doc_categories beyond unifying everything into a single flat bucket list (the `doc_category` column stays — see §6).
- Any RBAC or permissions change.
- Cross-bucket reorganization beyond the high-confidence auto-migration list in §5.

## 3. The 17 buckets (final, alphabetical)

Buckets are flat — no work_product/regulatory split in the UI. The `doc_category` column stays in the DB for downstream queries but is no longer the navigation primitive.

| # | doc_type value | UI label | Bucket meaning |
|---|---|---|---|
| 1 | `bid_protest` | Bid Protest | GAO / COFC protest filings, responses, decisions |
| 2 | `capability_statement` | Capability Statement | Marketing slicks, cap statements, one-pagers |
| 3 | `certificate` | Certificate | SAM registration, CAGE, cyber, ISO, training certs |
| 4 | `color_review` | Color Review | Pink/Red/Gold team artifacts, review minutes |
| 5 | `contract` | Contract | Awarded contract docs, mods, task orders |
| 6 | `correspondence` | Correspondence | Email threads, letters, formal communications |
| 7 | `financial` | Financial | P&L, balance sheet, AR/AP, indirect rates, audits, invoices in/out |
| 8 | `market_research` | Market Research | RFI responses, sources sought, NAICS analyses |
| 9 | `past_performance` | Past Performance | PPQs, CPARs, references |
| 10 | `personnel` | Personnel | Resumes, key-person letters, org charts, training records |
| 11 | `policy_regulatory` | Policy / Regulatory | FAR, DFARS, NDAA, EOs, GAO decisions, DoD policy, CMMC, CUI, ITAR/EAR (unified) |
| 12 | `proposal` | Proposal | Submitted proposals, drafts, exec summaries, BOEs |
| 13 | `rfp` | RFP / Solicitation | RFPs, RFIs, SOWs, amendments |
| 14 | `subcontract_teaming` | Subcontract / Teaming | Teaming agreements, NDAs, subcontract docs |
| 15 | `technical_artifact` | Technical Artifact | Tech specs, architecture docs, white papers, IP |
| 16 | `training_material` | Training Material | Internal SOPs, runbooks, training decks |
| 17 | `other` | Other | Anything that genuinely doesn't fit (NOT financials) |

**Critical:** `invoice` is folded into `financial`. `teaming_agreement` is renamed `subcontract_teaming`. All 12 regulatory subtypes are folded into `policy_regulatory` (we keep `regulatory_citation` text column for detail). `capability_statement`, `correspondence`, `financial`, `personnel`, `technical_artifact`, `training_material` are new.

## 4. Database migration

File: `apps/backend-v3/migrations/v3_058_vault_buckets_v2.sql`

```sql
-- v3_058: Vault redesign — 17 unified buckets
-- 2026-06-10

BEGIN;

-- 1) Drop the old constraint
ALTER TABLE vault_documents
  DROP CONSTRAINT IF EXISTS vault_documents_doc_type_check;

-- 2) High-confidence auto-migration (§5 rules — pure value rewrites, no NULLs)
UPDATE vault_documents SET doc_type = 'financial'
  WHERE doc_type = 'invoice';

UPDATE vault_documents SET doc_type = 'subcontract_teaming'
  WHERE doc_type = 'teaming_agreement';

UPDATE vault_documents SET doc_type = 'policy_regulatory'
  WHERE doc_type IN (
    'far', 'dfars', 'dfars_pgi', 'ndaa',
    'executive_order', 'gao_decision', 'dod_policy',
    'cmmc', 'cui_policy', 'itar_ear', 'usd_policy',
    'other_regulatory'
  );

-- 3) Confidence-based reclassification of 'other' rows
--    Only applied where the filename or ai_tags STRONGLY signal the bucket.
--    All others stay 'other' for the user to triage.
UPDATE vault_documents SET doc_type = 'financial'
  WHERE doc_type = 'other' AND (
    LOWER(filename) ~ '(invoice|p&l|pnl|balance.?sheet|income.?stmt|indirect.?rate|ar.aging|ap.aging|trial.?balance|audit|tax|w-?9|1099|financial|budget|forecast)'
  );

UPDATE vault_documents SET doc_type = 'capability_statement'
  WHERE doc_type = 'other' AND (
    LOWER(filename) ~ '(capability.?statement|marketing.?slick|one.?pager|cap.?stmt|company.?overview)'
  );

UPDATE vault_documents SET doc_type = 'correspondence'
  WHERE doc_type = 'other' AND (
    LOWER(filename) ~ '(email|letter|memo|correspondence|reply)'
  );

UPDATE vault_documents SET doc_type = 'personnel'
  WHERE doc_type = 'other' AND (
    LOWER(filename) ~ '(resume|cv|org.?chart|key.?person|personnel|training.?record)'
  );

UPDATE vault_documents SET doc_type = 'technical_artifact'
  WHERE doc_type = 'other' AND (
    LOWER(filename) ~ '(architecture|tech.?spec|whitepaper|white.?paper|technical.?design|sdd|srs)'
  );

UPDATE vault_documents SET doc_type = 'training_material'
  WHERE doc_type = 'other' AND (
    LOWER(filename) ~ '(sop|runbook|training|tutorial|guide.*deck|playbook)'
  );

-- 4) Apply the new constraint
ALTER TABLE vault_documents
  ADD CONSTRAINT vault_documents_doc_type_check
  CHECK (doc_type = ANY (ARRAY[
    'bid_protest',
    'capability_statement',
    'certificate',
    'color_review',
    'contract',
    'correspondence',
    'financial',
    'market_research',
    'past_performance',
    'personnel',
    'policy_regulatory',
    'proposal',
    'rfp',
    'subcontract_teaming',
    'technical_artifact',
    'training_material',
    'other'
  ]));

-- 5) Audit log entry
INSERT INTO vault_audit_trail (document_id, action, actor, notes, created_at)
SELECT
  id,
  'auto_migrated',
  'system:v3_058',
  'Reclassified during vault-buckets-v2 migration',
  NOW()
FROM vault_documents
WHERE updated_at >= NOW() - INTERVAL '5 seconds';

COMMIT;
```

**Manifest:** Update `scripts/ci/migration-manifest.txt` to include `v3_058_vault_buckets_v2.sql`.

## 5. Auto-migration logic (deterministic)

Already encoded in §4 SQL. Three tiers:

1. **Direct rename** (100% confidence): `invoice → financial`, `teaming_agreement → subcontract_teaming`, all 12 regulatory subtypes → `policy_regulatory`.
2. **High-confidence reclassification** (filename regex): rows currently in `other` whose filename matches a strong signal pattern are promoted to the matching bucket. Patterns are listed in §4. False-positive risk is minimized by requiring distinctive substrings (no "doc.pdf" → financial).
3. **Stay in `other`**: everything else stays `other` so the user can manually triage.

Counts will be reported via the audit_trail rows so the user can see exactly what moved.

## 6. doc_category column

Keep the column. Update its semantics: `regulatory` is set for `policy_regulatory` only. Everything else is `work_product`. This preserves any downstream query that filters on doc_category.

```sql
-- Inside the migration, before COMMIT
UPDATE vault_documents
  SET doc_category = 'regulatory'
  WHERE doc_type = 'policy_regulatory';

UPDATE vault_documents
  SET doc_category = 'work_product'
  WHERE doc_type != 'policy_regulatory';
```

## 7. Backend — `apps/backend-v3/src/routes/vault.ts`

- Update the validation list near line 537 (currently rejects with `Invalid doc_type: ...` when the value isn't recognized). The new accepted list is the 17 values in §3.
- The LLM-derived classification flow (currently sets `docTypeConfirmed = llmResult.output.doc_type_confirmed || docType`) MUST honor the user-supplied bucket. **If the user picked a bucket at upload, the LLM's `doc_type_confirmed` is ignored** — the user wins. The LLM result is still stored in `ai_tags` for transparency.
- Add a small helper exported from the route module:
  ```typescript
  export const VAULT_BUCKETS = [
    'bid_protest', 'capability_statement', 'certificate', 'color_review',
    'contract', 'correspondence', 'financial', 'market_research',
    'past_performance', 'personnel', 'policy_regulatory', 'proposal',
    'rfp', 'subcontract_teaming', 'technical_artifact', 'training_material',
    'other'
  ] as const;
  export type VaultBucket = typeof VAULT_BUCKETS[number];
  ```

## 8. Frontend — `packages/frontend-v3/src/app/vault/page.tsx`

### 8a. Constants

Replace the existing `DOC_TYPES` and `DOC_TYPE_LABELS` block with the 17-bucket list from §3 (alphabetical). Add an "All Types" leading sentinel for the filter dropdown.

### 8b. Top-of-page bucket chips

The user said "across the top, see pic, those buckets should be listed." Add a horizontal bucket bar above the filter row showing all 17 buckets as clickable chips, each with the count of docs in that bucket. Selected chip filters the table.

```tsx
<div className="flex flex-wrap gap-1 mb-3">
  <BucketChip label="All" active={!docTypeFilter} count={totalCount} onClick={() => setDocTypeFilter(undefined)} />
  {VAULT_BUCKETS.map(b => (
    <BucketChip
      key={b}
      label={DOC_TYPE_LABELS[b]}
      active={docTypeFilter === b}
      count={countsByBucket[b] ?? 0}
      onClick={() => setDocTypeFilter(b)}
    />
  ))}
</div>
```

`countsByBucket` comes from a new endpoint or from the existing `useVaultCount` hook extended to return counts keyed by `doc_type`. If extending the hook is non-trivial, fall back to fetching counts in a single query on page mount.

### 8c. Upload modal — bucket dropdown

In the existing `UploadModal` component (lines 932-1135), add a REQUIRED bucket dropdown that appears BEFORE the user clicks "Upload & Route". State variable `selectedBucket` with default `'other'`. Pass it in the FormData as `doc_type` (same key the backend already reads at line 537 of `vault.ts`).

```tsx
<label className="block text-xs font-medium mb-1">Bucket</label>
<select
  value={selectedBucket}
  onChange={e => setSelectedBucket(e.target.value)}
  className="..."
  required
>
  {VAULT_BUCKETS.map(b => (
    <option key={b} value={b}>{DOC_TYPE_LABELS[b]}</option>
  ))}
</select>
<p className="text-[10px] text-muted-foreground mt-1">
  AI will still summarize and tag the document, but the bucket you choose here is final.
</p>
```

### 8d. AI-ingested indicator (table column)

Add a column "AI" to the document list table, between "Type" and "Uploaded":

```tsx
<th className="px-3 py-2 text-center font-medium" title="AI ingestion status">AI</th>
...
<td className="px-3 py-2 text-center">
  {doc.ai_summary && doc.ai_tags ? (
    <span title={`AI ingested · ${(doc.ai_tags as string[]).length} tags`} className="text-gda-green">✓</span>
  ) : (
    <span title="AI pending" className="text-muted-foreground">⌛</span>
  )}
</td>
```

Same indicator in the document detail panel header (around line 687).

## 9. Tests

File: `apps/backend-v3/tests/routes/vault-buckets-v2.test.ts`

1. POST upload with `doc_type='financial'` succeeds and persists `doc_type='financial'`.
2. POST upload with `doc_type='invoice'` returns 400 with `Invalid doc_type: invoice` (old value no longer accepted).
3. POST upload with user-supplied `doc_type='financial'` overrides LLM's `doc_type_confirmed='other'`.
4. GET list with `doc_type=financial` filter returns only financial rows.

File: `packages/frontend-v3/src/app/vault/__tests__/upload-modal.test.tsx`

5. Upload modal renders bucket dropdown with 17 options.
6. Upload modal submits `doc_type` in the form data.
7. AI-ingested indicator shows ✓ when `ai_summary` and `ai_tags` are present, ⌛ otherwise.

File: `apps/backend-v3/tests/migrations/v3_058.test.ts`

8. Migration up: 100 seeded rows with old types migrate to the right new buckets. Specifically:
   - All `invoice` → `financial`
   - All `teaming_agreement` → `subcontract_teaming`
   - All 12 regulatory subtypes → `policy_regulatory`
9. Migration up: a row with `filename='2026_Q1_P&L.pdf'` and `doc_type='other'` is promoted to `financial`.
10. Migration up: a generic `doc_type='other'` row with `filename='random.pdf'` stays in `other`.

## 10. CI

Same gates as PRs #784 / #785. Pre-existing failures (`Compose Drift Check`, `LLM Router Gates (F-215 D4)`) NOT required to pass.

## 11. Acceptance criteria

Architect will merge if and only if:

1. Migration `v3_058` lives in the manifest and runs cleanly on a copy of staging data.
2. Backend `vault.ts` validates exactly the 17 buckets in §3 and honors user-supplied `doc_type` over LLM inference.
3. Frontend renders the 17 bucket chips alphabetically across the top.
4. Upload modal includes the bucket dropdown as a required field.
5. Document list shows the AI-ingested column with ✓ / ⌛.
6. All 10 tests in §9 pass.
7. No files outside this PR's scope are modified.

## 12. Post-merge migration steps (architect)

1. Pull main on the VPS.
2. Run the migration: `docker exec gda-backend-v3 npm run --workspace=apps/backend-v3 migrate:up`.
3. Run a count query: `SELECT doc_type, COUNT(*) FROM vault_documents WHERE deleted_at IS NULL GROUP BY doc_type ORDER BY doc_type;` and share with Shawn so he can spot-check the reclassification.
4. Rebuild frontend container.
5. Hit `/vault` in the browser, confirm chips, dropdown, and AI badge render.

End of spec.
