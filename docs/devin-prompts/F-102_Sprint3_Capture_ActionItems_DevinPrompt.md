# F-102 — GDA Command v2 Rebuild · Sprint 3 (Capture + Action Items)

**Repo:** shawnseffernick175/gda-command-v2
**Branch:** `feature/F-102-sprint3-capture-action-items`
**Type:** Schema migration + backend modules + 2 frontend pages + 1 n8n workflow stub
**Doctrine anchors:** Process over Personality · Teamwork · Relentless Execution · Data First

## Why

Sprint 2 (F-101) built the intake and radar: Opportunities, Pipeline, and Partner Intel. Sprint 3 builds the execution engine.

**Capture (door 3)** is where proposals are won or lost. The RFP shredder eliminates the hero-reviewer problem: every compliance requirement is documented, owned, and tracked — not held in someone's head. The color review workflow (Pink → Red → Gold) is a process-driven gate, not a personality-driven one. Pricing guardrails enforce the 10% gross margin floor from the board plan. The teaming worksheet generator pulls partner certs, vehicles, and PP directly from Partner Intel so Envision stops writing teaming rationales from scratch on every proposal. Doctrine Principle: **Process over Personality** — the tool runs the review, not whoever is in the room.

**Action Items (door 10)** is where Relentless Execution becomes a daily operational discipline. Drag an email into the door; the tool extracts the action, owner (default: Shawn), and due date — then drafts a reply, a research prompt, or a milestone link. Individual ownership is required; committee-owned items are not created. Cross-OU action items (ask Angela, ping Gina) are tagged with the partner. Items push to other doors: an email about a proposal milestone becomes a pipeline milestone without re-entry. Doctrine Principle: **Relentless Execution** — 90-day increments, individual ownership, no committees.

Sprint 3 depends on Sprint 1 (F-100) and Sprint 2 (F-101) being merged and green. Specifically: `pipeline_items`, `partner_intel_profiles`, and `teaming_flags` tables must exist before this sprint begins.

---

## What to build

### 1. Schema additions — migrations (next sequential numbers in `packages/backend/src/db/migrations/`)

#### 1a. `captures` table

```sql
CREATE TYPE color_review_stage AS ENUM ('pink', 'red', 'gold', 'submitted');

CREATE TABLE captures (
  id                      BIGSERIAL PRIMARY KEY,
  ou_tag                  ou_tag NOT NULL DEFAULT 'envision',
  pipeline_item_id        BIGINT NOT NULL REFERENCES pipeline_items(id),
  rfp_uploaded_at         TIMESTAMPTZ,
  rfp_storage_url         TEXT,
  compliance_matrix       JSONB NOT NULL DEFAULT '[]',   -- [{section_number, requirement_text, owner_team, status, evidence_link}]
  color_review_stage      color_review_stage NOT NULL DEFAULT 'pink',
  color_review_notes      TEXT[] NOT NULL DEFAULT '{}',  -- append-only log of reviewer notes per stage
  pricing_assumptions     JSONB NOT NULL DEFAULT '{}',   -- {labor_rate, overhead_pct, fringe_pct, fee_pct, margin_pct, notes}
  teaming_worksheet       JSONB NOT NULL DEFAULT '{}',   -- {partner_ou_tag, certs_claimed, vehicles_listed, pp_highlights, rationale_paragraph}
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_captures_pipeline    ON captures(pipeline_item_id);
CREATE INDEX idx_captures_stage       ON captures(color_review_stage);
CREATE INDEX idx_captures_ou_tag      ON captures(ou_tag);
```

#### 1b. `compliance_items` table

```sql
CREATE TABLE compliance_items (
  id                BIGSERIAL PRIMARY KEY,
  capture_id        BIGINT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  section_number    TEXT,
  requirement_text  TEXT NOT NULL,
  owner_team        TEXT,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','complete','waived')),
  evidence_link     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_capture   ON compliance_items(capture_id);
CREATE INDEX idx_compliance_status    ON compliance_items(status);
```

#### 1c. `action_items` table

```sql
CREATE TYPE action_source AS ENUM ('email', 'manual', 'sentinel', 'launchpad');
CREATE TYPE action_status AS ENUM ('open', 'done', 'blocked');

CREATE TABLE action_items (
  id                    BIGSERIAL PRIMARY KEY,
  ou_tag                ou_tag NOT NULL DEFAULT 'envision',
  title                 TEXT NOT NULL,
  detail                TEXT,
  owner_email           TEXT NOT NULL DEFAULT 'shawn',   -- individual owner required; no committees
  source                action_source NOT NULL DEFAULT 'manual',
  source_id             TEXT,                             -- e.g. email message-id or sentinel snapshot id
  due_date              DATE,
  due_inferred_from     TEXT,                             -- e.g. "email body: 'by end of week'"
  status                action_status NOT NULL DEFAULT 'open',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  linked_record_type    TEXT,                             -- e.g. 'pipeline_item', 'opportunity', 'capture', 'partner_intel_profile'
  linked_record_id      BIGINT
);

CREATE INDEX idx_action_items_status     ON action_items(status);
CREATE INDEX idx_action_items_owner      ON action_items(owner_email);
CREATE INDEX idx_action_items_due        ON action_items(due_date) WHERE status = 'open';
CREATE INDEX idx_action_items_ou_tag     ON action_items(ou_tag);
CREATE INDEX idx_action_items_source     ON action_items(source);
```

#### 1d. `action_item_drafts` table

```sql
CREATE TYPE draft_kind AS ENUM ('reply', 'research', 'milestone');
CREATE TYPE draft_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE action_item_drafts (
  id              BIGSERIAL PRIMARY KEY,
  action_item_id  BIGINT NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  kind            draft_kind NOT NULL,
  draft_text      TEXT NOT NULL,
  status          draft_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drafts_action_item  ON action_item_drafts(action_item_id);
CREATE INDEX idx_drafts_status       ON action_item_drafts(status);
```

---

### 2. Sentinel — add new probes to `packages/backend/src/lib/health-sentinel.ts`

Add these probes to the existing `runSentinel()` function (do not modify existing probes from F-039, F-100, or F-101):

- `captures_table_alive` — pass if `SELECT COUNT(*) FROM captures` executes without error
- `compliance_items_table_alive` — pass if `SELECT COUNT(*) FROM compliance_items` executes without error
- `action_items_table_alive` — pass if `SELECT COUNT(*) FROM action_items` executes without error
- `email_ingest_active` — pass if `action_items` has at least one row with `source='email'` created within the last 48h, OR if no email has been forwarded yet (table is empty or no email rows exist — treat as `info` not `degraded`). Detail: `"Last email-sourced action item: [created_at] or none yet"`

---

### 3. New module — `packages/backend/src/lib/rfp-shredder.ts`

Exported function:

```typescript
async function shredRfp(
  fileBuffer: Buffer,
  mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  captureId: number,
  pool: Pool
): Promise<ComplianceItem[]>
```

Logic:
1. Extract raw text from the file buffer:
   - PDF: use `pdf-parse` (already installed or install it)
   - DOCX: use `mammoth` (already installed or install it)
2. Parse sections: split on common RFP section patterns (`Section L`, `Section M`, `PWS`, `SOW`, numbered headings like `1.`, `1.1`, `C.`, `L.`, `M.`).
3. For each section, identify compliance requirements: sentences containing `shall`, `must`, `required`, `required to`, `contractor shall`, `offeror shall` (case-insensitive).
4. Create a `compliance_items` row for each requirement:
   - `capture_id` = captureId
   - `section_number` = detected section header (or `"Unknown"`)
   - `requirement_text` = the requirement sentence (truncated at 1000 chars)
   - `owner_team` = null (to be assigned in UI)
   - `status` = `'open'`
5. Insert all rows, update `captures.compliance_matrix` with a summary `{total, by_section: []}`.
6. Return the created `compliance_items`.

Do not use an AI/LLM model for parsing in this sprint — regex + keyword extraction only. Add a TODO comment: `// TODO Sprint 4: replace regex parser with LLM-assisted requirement extraction via Agentic AI door`.

---

### 4. New module — `packages/backend/src/lib/pricing-guard.ts`

Exported function:

```typescript
function checkPricingGuardrails(assumptions: PricingAssumptions): PricingGuardrailResult
```

Where `PricingAssumptions` = `{labor_rate?: number, overhead_pct?: number, fringe_pct?: number, fee_pct?: number, margin_pct?: number, notes?: string}`

Logic:
- If `margin_pct` is provided AND `margin_pct < 10` → return `{pass: false, alert: 'Gross margin ${margin_pct}% is below the 10% floor (FY26 board plan minimum). Adjust pricing before advancing.'}`
- If `margin_pct` is provided AND `margin_pct >= 10` → return `{pass: true, alert: null}`
- If `margin_pct` is not provided → return `{pass: null, alert: 'Margin % not entered. Enter pricing assumptions to validate guardrail.'}`

This is intentionally simple. Do not add other guardrail logic this sprint.

---

### 5. New module — `packages/backend/src/lib/teaming-worksheet.ts`

Exported function:

```typescript
async function generateTeamingWorksheet(
  captureId: number,
  partnerOuTags: OuTag[],
  pool: Pool
): Promise<TeamingWorksheet>
```

Logic:
1. For each `partnerOuTag` in `partnerOuTags`, fetch from `partner_intel_profiles`.
2. Build the worksheet:
   - `partner_ou_tag`: the partner
   - `certs_claimed`: array of cert names from partner's `certs` array where `status='active'`
   - `vehicles_listed`: array of vehicle names + contract_numbers from partner's `vehicles` array
   - `pp_highlights`: array from `partner_awards` (last 3 by `awarded_at DESC` for this partner), formatted as `"{customer} — ${value} — {awarded_at year}"`
   - `rationale_paragraph`: a static template string: `"[Partner display name] brings [cert list joined by ', '] certifications and access to [vehicle list joined by ', '] contract vehicles. Recent performance includes [pp_highlights joined by '; ']. Envision proposes to leverage [Partner display name] as a [teaming role: prime/sub — default 'subcontractor'] to fulfill [capability gap]."`
3. Update `captures.teaming_worksheet` with the result.
4. Return the worksheet.

---

### 6. New module — `packages/backend/src/lib/email-action-extractor.ts`

Exported function:

```typescript
async function extractActionFromEmail(
  emailPayload: EmailPayload
): Promise<ExtractedAction>
```

Where `EmailPayload` = `{from: string, to: string, subject: string, body_text: string, body_html?: string, message_id?: string, received_at: string}`

Logic (regex + heuristic — no AI this sprint; add a TODO for LLM upgrade):

1. **Title extraction:** Use subject line stripped of `Re:`, `Fwd:`, `FW:`, leading/trailing whitespace. If subject is empty, use first non-empty line of body text, truncated to 120 chars.
2. **Due date extraction:** Scan body text for patterns:
   - Explicit: `by [date]`, `due [date]`, `deadline [date]`, `no later than [date]`, `NLT [date]` — extract and parse the date
   - Relative: `by EOD`, `by end of day` → today's date; `by EOW`, `by end of week` → nearest Friday; `by EOM`, `by end of month` → last day of current month; `by next [weekday]` → next occurrence of that weekday
   - Store `due_inferred_from` as the matched phrase for auditability
3. **Owner extraction:** Check for explicit mentions of `Shawn`, `you`, `your` → `owner_email='shawn'`. If body mentions `Angela` → `ou_tag='riverstone'`, note cross-OU. If mentions `Gina` → note PD Systems. Default owner is always `'shawn'`.
4. **Draft type:** If body contains `reply`, `respond`, `let me know`, `please confirm`, `get back` → `kind='reply'`. If contains `research`, `look into`, `find out`, `check on` → `kind='research'`. Else → `kind='milestone'`.
5. **Draft text generation:**
   - `reply`: `"Hi [from-name], Understood — I'll [title]. Will follow up by [due_date or 'shortly']. — Shawn"`
   - `research`: `"Research prompt: [title]. Scope: review against GDA doctrine + capabilities. Source: [from email] [received_at]."`
   - `milestone`: `"Milestone: [title]. Owner: [owner_email]. Due: [due_date or 'TBD']. Linked from email [message_id or 'N/A']."`
6. Return `{title, detail: body_text (first 500 chars), owner_email, source: 'email', source_id: message_id, due_date, due_inferred_from, draft: {kind, draft_text}}`

Add a TODO comment: `// TODO Sprint 4/5: replace heuristic extraction with Agentic AI door LLM call (door 11).`

---

### 7. New routes — `packages/backend/src/routes/captures.ts`

**Wire into `server.ts` like other routes.**

- `GET /api/captures` — returns all captures with joined pipeline + opportunity titles. Query params: `ou_tag`, `stage`. Default `ou_tag=envision`. Order by `updated_at DESC`.
- `POST /api/captures` — auth-protected. Body: `{pipeline_item_id, ou_tag?}`. Pipeline item must exist; 404 if not. Creates capture in `pink` stage. Returns 201.
- `PATCH /api/captures/:id` — auth-protected. Update `color_review_notes`, `pricing_assumptions`, `teaming_worksheet`. When `pricing_assumptions.margin_pct` is provided, run `checkPricingGuardrails()` and include the result in the response as `pricing_guardrail`. Do not block save — only warn.
- `POST /api/captures/:id/shred-rfp` — auth-protected. Multipart file upload. Accepts `application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document` only; reject 400 for other types. Calls `shredRfp()`. Updates `captures.rfp_uploaded_at` and `rfp_storage_url` (store to local disk in `uploads/rfp/` or existing storage bucket if configured). Returns compliance items array.
- `POST /api/captures/:id/advance-stage` — auth-protected. Advances stage in order: `pink → red → gold → submitted`. Returns 400 if already `submitted`. Appends reviewer's note (from request body `{note: string}`) to `color_review_notes`. Returns updated capture.
- `POST /api/captures/:id/generate-teaming-worksheet` — auth-protected. Body: `{partner_ou_tags: string[]}`. Calls `generateTeamingWorksheet()`. Returns the worksheet. Validates that each `partner_ou_tag` is a known partner (`riverstone` or `pd_systems`) — 400 otherwise.

---

### 8. New routes — `packages/backend/src/routes/action-items.ts`

**Wire into `server.ts` like other routes.**

- `GET /api/action-items` — returns items. Query params: `status`, `owner_email`, `source`, `ou_tag`, `linked_record_type`. Default: all non-done items (`status != 'done'`) unless `status` param provided. Order by `due_date ASC NULLS LAST, created_at DESC`.
- `POST /api/action-items` — creates a new item manually. `owner_email` defaults to `'shawn'`; individual owner required (reject if `owner_email` is blank or a team name like `'team'`, `'all'`, `'everyone'`). Returns 201.
- `PATCH /api/action-items/:id` — update `status`, `owner_email`, `due_date`, `linked_record_type`, `linked_record_id`. When setting `status='done'`, auto-sets `completed_at=NOW()`.
- `POST /api/action-items/ingest-email` — accepts forwarded email payload from `ingest@gda.csr-llc.tech`. Body shape: `EmailPayload` (see module above). Calls `extractActionFromEmail()`. Creates `action_items` row + `action_item_drafts` row. Returns the created item + draft. This endpoint does NOT require `x-gda-key` auth (it is called from n8n which uses a separate credential); add a TODO to add IP allowlist in production.
- `POST /api/action-items/:id/approve-draft/:draft_id` — auth-protected. Sets `action_item_drafts.status='approved'`. Returns the approved draft.

---

### 9. Frontend — `pages/Capture.tsx`

Top to bottom:

1. **Page header** — "Capture" + subtitle: "RFP → Compliance → Color Review → Submission"
2. **Capture list / selector** — left panel or top dropdown: list of captures with stage badge (Pink/Red/Gold/Submitted, color-coded), pipeline item name, opportunity title. Clicking selects the capture for the right panel.
3. **RFP upload zone** — `<div>` drop zone with dashed border: "Drop RFP here (PDF or DOCX) or click to browse." On upload: calls `POST /captures/:id/shred-rfp`. Show loading skeleton while processing. On success: display compliance matrix.
4. **Compliance matrix table** — rendered after shred:
   - Columns: Section | Requirement | Owner | Status | Evidence
   - Status column: `<select>` with options open/in_progress/complete/waived (calls `PATCH /compliance-items/:id` on change — Devin: add a `PATCH /api/compliance-items/:id` route for status/owner/evidence updates)
   - Owner column: editable text input
   - Evidence column: text input for URL or note
   - Summary bar: "[N] total, [N] open, [N] complete" as `<div>` progress fill
5. **Color review stage indicator** — horizontal stage strip:
   - Four stages: Pink → Red → Gold → Submitted
   - Current stage highlighted. Past stages shown as completed (checkmark). Future stages muted.
   - "Advance Stage" button (auth-gated): opens a small modal asking for reviewer note. Calls `POST /captures/:id/advance-stage`.
6. **Pricing guardrail section** — card below the stage strip:
   - Inputs: Margin % (number input). Shows live guardrail result: green if ≥10%, red warning if <10%, gray if empty.
   - "Save" button calls `PATCH /captures/:id` with `pricing_assumptions`.
7. **Teaming worksheet preview** — card at bottom:
   - Partner selector: checkboxes for Riverstone and/or PD Systems
   - "Generate Worksheet" button: calls `POST /captures/:id/generate-teaming-worksheet`. Shows result as a formatted text block with cert list, vehicle list, PP highlights, and rationale paragraph.
   - Copy-to-clipboard button on rationale paragraph.

---

### 10. Frontend — `pages/ActionItems.tsx`

Top to bottom:

1. **Page header** — "Action Items" + count badge (open items only)
2. **Email drop zone** — `<div>` drop zone at the top: "Drop a forwarded email here to extract an action item." Accepts `.eml` files or plain text. On drop: read file content, call `POST /api/action-items/ingest-email`, refresh list. Alternatively: "Paste email text" button opens a textarea modal with a submit button.
3. **Grouped item list** — three groups rendered as sections:
   - **Open** (status=open): items sorted by `due_date ASC NULLS LAST`
   - **Blocked** (status=blocked)
   - **Done** (status=done, collapsed by default — "Show [N] done items" expand toggle)
   - Each item row: title, owner badge, due date (red if overdue, yellow if due within 3 days), source badge (email/manual/sentinel/launchpad), linked record chip if present
4. **Draft reply preview pane** — clicking an item expands an inline panel (or right side drawer):
   - Shows item title, detail, owner, due date
   - Draft (if exists): shows `kind` label (Reply / Research / Milestone), draft text in a gray code-like block, status badge (Pending/Approved/Rejected)
   - "Approve" button: calls `POST /action-items/:id/approve-draft/:draft_id`
   - "Edit" inline: allows modifying the draft text before approval
   - If no draft exists: "Create Manual Draft" dropdown (Reply / Research / Milestone) → opens textarea
5. **Mark Done / Mark Blocked** buttons on each item (inline, small). Clicking Done calls `PATCH /action-items/:id` with `{status:'done'}`.
6. **"New Action Item" button** — top right: opens a modal with title (required), detail (optional), owner_email (default 'shawn', required), due date (optional). Rejects if owner is blank. Calls `POST /api/action-items`.

**Owner validation visible in UI:** if user clears `owner_email` or types a team-name value, show inline red error "Individual owner required (Doctrine: Relentless Execution)."

---

### 11. n8n workflow stub

#### `docs/n8n-email-action-ingest.json`

This workflow already exists as a partial stub (wired via `ingest@gda.csr-llc.tech`). Update or replace it with the full action-item extraction step.

Schedule / trigger: **email trigger** (not cron — real-time when email arrives at `ingest@gda.csr-llc.tech`). Nodes:
1. **Email trigger** — existing n8n Gmail or IMAP trigger node on `ingest@gda.csr-llc.tech` (use existing credential)
2. **Filter** — skip if subject contains `[SENTINEL]` or `[SYSTEM]` (those are infra emails, not action items)
3. **Transform** — map email fields to `EmailPayload` shape: `{from, to, subject, body_text, body_html, message_id, received_at}`
4. **POST to GDA** — `POST {{$env.GDA_BASE_URL}}/api/action-items/ingest-email` with `x-gda-key` header from credential `GDA Webhook Auth v2` (id `F4J3vYsPrJrYiO49`)
5. **Log result** — log the created action item `id` and `title` to n8n run log for audit trail
6. **Error handler** — on non-2xx from GDA: log full response body to n8n run log; do not email

---

### 12. Additional minor route — `packages/backend/src/routes/compliance-items.ts` (or extend `captures.ts`)

- `PATCH /api/compliance-items/:id` — auth-protected. Updates `status`, `owner_team`, `evidence_link`. Returns updated item. Validate `status` is one of the enum values.

Wire into `server.ts`.

---

### 13. Tests

#### `packages/backend/src/__tests__/captures.test.ts`

- `POST /api/captures` with invalid `pipeline_item_id` returns 404
- `POST /api/captures` creates capture with stage `'pink'` default
- `POST /api/captures/:id/shred-rfp` with non-PDF/DOCX file returns 400
- `POST /api/captures/:id/shred-rfp` with valid PDF returns compliance items array
- `POST /api/captures/:id/advance-stage` advances `pink → red → red → gold` in sequence
- `POST /api/captures/:id/advance-stage` on `submitted` stage returns 400
- `PATCH /api/captures/:id` with `margin_pct=8` returns `pricing_guardrail.pass=false`
- `PATCH /api/captures/:id` with `margin_pct=15` returns `pricing_guardrail.pass=true`
- `POST /api/captures/:id/generate-teaming-worksheet` with `partner_ou_tags=['envision']` returns 400 (envision is not a partner)
- `POST /api/captures/:id/generate-teaming-worksheet` with `['riverstone']` returns worksheet with certs + vehicles

#### `packages/backend/src/__tests__/action-items.test.ts`

- `POST /api/action-items` with blank `owner_email` returns 400
- `POST /api/action-items` creates item with `owner_email='shawn'` as default
- `POST /api/action-items/ingest-email` with valid EmailPayload creates action_item + draft
- `POST /api/action-items/ingest-email` extracts due date from phrase `"by end of week"`
- `PATCH /api/action-items/:id` with `{status:'done'}` sets `completed_at`
- `POST /api/action-items/:id/approve-draft/:draft_id` sets draft status to `'approved'`
- `GET /api/action-items` default returns only non-done items
- `GET /api/action-items?status=done` returns only done items

#### `packages/backend/src/__tests__/rfp-shredder.test.ts`

- Given a text buffer containing `"The Contractor shall deliver monthly status reports."`, shredder returns one compliance item with `requirement_text` containing that sentence
- Given a text with section header `"Section L"` followed by requirements, items carry `section_number='Section L'`
- Given a DOCX buffer (mock), shredder does not throw and returns an array (may be empty)
- Given a buffer with no `shall`/`must` keywords, shredder returns empty array

Mock DB where appropriate. Do NOT hit live storage, n8n, or external APIs in tests. Use real in-memory buffers for rfp-shredder unit tests.

---

## Constraints

- **Do NOT touch** Launchpad / Company Profile / Sentinel modules from Sprint 1 (F-100), Opportunities / Pipeline / Partner Intel from Sprint 2 (F-101), F-038 ingestion, F-039 core probes, F-040 secret rotation.
- **Do NOT use an AI/LLM model** in the RFP shredder or email extractor this sprint — regex + heuristics only. Add TODOs for Sprint 4/5 LLM upgrade.
- **Individual owner required** on all action items — enforce at both route level (400 on blank/team-name) and frontend (inline validation).
- **No auto-stage advancement** — Capture stage must be manually advanced by Shawn via `POST /advance-stage`. The tool does not auto-promote based on compliance matrix completeness.
- Pricing guardrail is a **warning only** — it does not block saving. The tool must surface the 10% floor alert but must not prevent Shawn from saving pricing assumptions.
- **Do not rotate, regenerate, or touch any secrets.**
- **Do not import n8n workflow JSONs into live n8n — Shawn will.**
- All times stored as UTC; displayed as EST in frontend.
- Frontend pages use existing component library + Tailwind/ECharts (no new chart libraries).
- **No cartoon charts.** Progress bars for compliance summary are `<div>` elements only. (Doctrine: Data First.)
- Manual ingestion via universal drag-drop (F-038) must continue working — do not touch the F-038 ingest router.

---

## Deliverable

- One PR: `feature/F-102-sprint3-capture-action-items`
- 5/5 CI green
- Tests pass
- Migrations apply cleanly forward AND reverse on local
- Self-review your PR before requesting review
- Open as draft if anything is uncertain — comment in PR with the question
- Include screenshots of Capture page (all sections) and ActionItems page (email drop zone + grouped list + draft preview pane) in the PR description

---

## Acceptance criteria (how Shawn judges done)

1. ✅ `captures` table created with `color_review_stage` enum defaulting to `'pink'`
2. ✅ `compliance_items` table created and linked to `captures`
3. ✅ `action_items` table created with `owner_email` default `'shawn'`; blank owner rejected at route level
4. ✅ `action_item_drafts` table created
5. ✅ `POST /api/captures/:id/shred-rfp` with a PDF containing `shall` keywords returns at least one compliance item
6. ✅ `POST /api/captures/:id/advance-stage` advances stage in order; `submitted → advance` returns 400
7. ✅ `PATCH /api/captures/:id` with `margin_pct < 10` returns `pricing_guardrail.pass=false` in response; record still saves
8. ✅ `POST /api/captures/:id/generate-teaming-worksheet` with `['riverstone']` returns worksheet containing Riverstone's HUBZone cert and MDA SHIELD vehicle
9. ✅ `POST /api/action-items/ingest-email` with a valid email payload creates action item + draft
10. ✅ `POST /api/action-items` with blank `owner_email` returns 400
11. ✅ ActionItems page shows three grouped sections (Open / Blocked / Done)
12. ✅ Capture page shows: RFP upload zone → compliance matrix table → stage strip → pricing guardrail card → teaming worksheet generator
13. ✅ `docs/n8n-email-action-ingest.json` stub present in `docs/`
14. ✅ Sentinel reports four new probes (`captures_table_alive`, `compliance_items_table_alive`, `action_items_table_alive`, `email_ingest_active`) all green
15. ✅ All tests in four test files pass

---

## Out of scope (do NOT touch this sprint)

- Performance door (door 4)
- Past Performance door (door 5)
- Vehicles & IDIQs door (door 6)
- Financial Bible (door 8)
- Agentic AI door (door 11) — LLM integration for shredder and email extractor is a Sprint 4/5 upgrade; TODOs only this sprint
- Color review PDF export / Word generation
- Teaming worksheet export to DOCX (Sprint 4)
- Authentication / multi-user / role-based permissions
- Email/SMS/push alerting from Action Items (Phase 2)
- Pinecone / vector cleanup (paused)
- Reader cutover (paused)

---

## Aesthetics & Organization Standard (non-negotiable)

This section is the single source of truth for all UI work going forward. It supersedes any earlier visual choices. Match the Sprint 1 prototype tokens exactly. Shawn reviews every UI change against this list before merging.

**Design feel:** Quiet, dense, neutral, professional. No chrome. No decoration. Looks like an instrument panel a senior partner uses, not a SaaS dashboard.

### Color tokens (Tailwind config — `tailwind.config.js`)

```js
colors: {
  bg:       '#F7F6F2',  // warm off-white page background (never pure white)
  ink:      '#28251D',  // primary text
  muted:    '#7A7974',  // secondary text, captions, labels
  border:   '#D4D1CA',  // hairline borders, dividers
  accent:   '#01696F',  // Hydra Teal — THE ONLY accent (links, active states, primary buttons, pillar pills)
  critical: '#A12C7B',  // deep magenta — severity ONLY (critical flags, expired badges)
}
```

**Rules:**
- One accent: `accent` (#01696F). It marks the active tab, primary buttons, source links, and one-pixel left-bars on banner cards.
- Critical severity uses `critical` (#A12C7B). Never confused with accent.
- Card background is `#FFFFFF`. Page background is `bg` (#F7F6F2). Body is never pure white.
- No gradients. No shadows beyond the 1px card shadow defined below. No glow effects.

### Typography

- Font family: **Inter only**, loaded from Google Fonts (`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">`). No second font. No monospace family.
- Sizes (in `theme.extend.fontSize`):
  - `display` — 32px / 40px line / -0.01em tracking / 600 weight (page titles)
  - `section` — 20px / 28px line / 600 weight (section headers)
  - `body` — 15px / 24px line (default)
  - `caption` — 12px / 16px line (metadata, doctrine tags)
- Doctrine tags: caption size, italic, `muted` color.
- All numbers use `font-variant-numeric: tabular-nums`. Applied globally in `index.css` to `table, td, th, .num, .nums`.

### Layout

- Page wrapper: `max-width: 1280px; margin: 0 auto; padding: 0 32px;` (utility class `.container-page`).
- Card: `background:#FFFFFF; border:1px solid #D4D1CA; border-radius:4px; padding:24px; box-shadow:0 1px 2px rgba(0,0,0,0.04);` (utility class `.card`).
- Banner / critical flag cards: same as card PLUS a 4px left accent bar in either `accent` or `critical` depending on severity.
- Spacing: 8px base grid. Use 8, 16, 24, 32, 48. Never 7, 9, 14, 27, etc.
- Border radius: 4px everywhere. Never larger.

### Buttons

- Default: 32px height, 16px horizontal padding, 4px radius, 13px font, 500 weight, 1px `border` border, white background, `ink` text. Hover: background → `bg`.
- Primary: same dimensions, `accent` background, white text, `accent` border. Hover: background → `#015C61`.
- No icon-only buttons. No floating action buttons. No gradient buttons.

### Tabs

- Tabs sit on the same row, 16px gap. Active tab has a **2px Hydra Teal underline** directly below the label. Inactive tabs are `muted` color. No background fill on tabs.

### Severity badges

- **Critical** (e.g. "EXPIRED APR 29, 2026"): filled badge, `critical` background, white text, 11px font, 600 weight, 4px radius, 4px/8px padding.
- **Warning** (e.g. "EXPIRES IN 71 DAYS"): outlined badge, 1px amber border (`#B45309`), amber text, same dimensions.
- **OK / Current**: no badge needed; use `muted` text inline.
- Never use red dots, yellow dots, or traffic-light dots as decoration.

### Tables

- 1px `border` lines between rows. Header row: caption size, `muted` color, uppercase, 0.04em tracking.
- All numeric columns right-aligned, `tabular-nums`.
- No zebra striping. No row hover background (unless row is clickable, then `bg` on hover).

### Dates and times

- All dates render in Eastern Time. Never raw UTC. Use the existing format helpers (`formatShortDate`, `formatLongDate`, `formatTimeEastern`).
- Format examples: "Thursday, May 28, 2026" for long; "May 28, 2026" for short; "10:47 PM EST" for times.

### Forbidden

- **Zero decorative charts.** Charts only when they convey real meaning. Use ECharts only. Never recharts, never Chart.js, never canvas hacks. No charts in Sprint 1, none in Sprint 2 unless explicitly required and Shawn-approved.
- **No icons except** abstract severity dots and the dismiss "×" on flag cards. No Lucide icon spray. No Heroicons spray. No emoji in UI.
- **No animations** beyond a 120ms ease background-color transition on buttons and links.
- **No stock images, no illustrations, no gradients, no glows.**
- **No dark mode** in this build.

### Component organization

- One component per file. No 400-line page files. Pages compose components.
- File names match component names exactly (PascalCase.tsx).
- Page files live in `pages/`. Reusable components live in `components/<domain>/`.

### Forbidden patterns from past mistakes

- Do NOT use the old dark-theme tokens (`#0f1117`, `#1a1d27`, `#3b82f6`, etc.). They are deprecated.
- Do NOT use inline `style={...}` for colors. Use Tailwind classes that reference the tokens above.
- Do NOT use JetBrains Mono or any monospace font for body text.
- Do NOT use `.kpi-grid`, `.signal-grid`, `.funnel-row` legacy class names — they belong to the deprecated layout.


---

## Canonical reference docs (read before starting)

- `/home/user/workspace/gda/tool_ownership_model_v1.md` — why Envision is primary and partners are intel
- `/home/user/workspace/gda/gda_company_profile_v1.md` — ground truth for all profile data (financial targets, pricing floor, partner identity)
- `/home/user/workspace/gda/doctrine_to_doors_map.md` — what each door must enforce (doors 3 and 10)
- `/home/user/workspace/gda/partner_intel_spec_v1.md` — door 12 spec; teaming worksheet must pull from partner certs/vehicles/PP as specified here
- `/home/user/workspace/gda/F-100_Sprint1_OUTag_Sentinel_Launchpad_CompanyProfile_DevinPrompt.md` — Sprint 1 foundation; do not touch Sentinel core probes, Launchpad, or Company Profile
- `/home/user/workspace/gda/F-101_Sprint2_Opportunities_Pipeline_PartnerIntel_DevinPrompt.md` — Sprint 2 foundation; `pipeline_items`, `partner_intel_profiles`, and `teaming_flags` tables must exist before this sprint begins; do not modify Sprint 2 routes
