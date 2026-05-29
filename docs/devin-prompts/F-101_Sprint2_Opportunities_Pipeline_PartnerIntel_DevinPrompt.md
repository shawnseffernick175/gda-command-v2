# F-101 — GDA Command v2 Rebuild · Sprint 2 (Opportunities + Pipeline + Partner Intel)

**Repo:** shawnseffernick175/gda-command-v2
**Branch:** `feature/F-101-sprint2-opps-pipeline-partner-intel`
**Type:** Schema migration + backend modules + 3 frontend pages + 3 n8n workflow stubs
**Doctrine anchors:** Market/Mission/Brand Focus · Data First · Teamwork · Relentless Execution

## Why

Sprint 1 (F-100) laid the foundation: OU tag, Sentinel skeleton, Launchpad, Company Profile. Sprint 2 builds the three doors where Envision's business development machinery actually lives.

**Opportunities (door 1)** is the intake valve. Every pursuit starts here. NAICS-aware scoring and Grade A/B/C evidence stop Envision from chasing contracts that don't fit. The Qualify-to-Pipeline gate enforces Doctrine Principle 7 (Market, Mission, Brand Focus): no auto-promote, no opinion-only decisions — Shawn qualifies.

**Pipeline (door 2)** is the war room. Qualified pursuits only. Capture plans with named owners, 90-day milestones, and evidence-backed win probability enforce Doctrine Principle 5 (Relentless Execution). Teaming tags pull in Riverstone or PD Systems when a pursuit requires it.

**Partner Intel (door 12)** is the teaming radar. Riverstone and PD Systems are not co-tenants — they are intel records. This door tells Envision when a partner unlocks a bid, when a de-confliction check is needed, and what each partner brings to the table. Doctrine Principle 3 (Teamwork) lives here operationally.

Sprint 2 depends on Sprint 1 migrations and the Sentinel skeleton from F-100 / F-039, AND on F-100.5 (the visual reskin that brings Sprint 1's UI in line with the Aesthetics & Organization Standard at the bottom of this prompt). Do not begin if those are not merged and green.

---

## What to build

### 1. Schema additions — migrations (next sequential numbers in `packages/backend/src/db/migrations/`)

#### 1a. `opportunities` table

```sql
CREATE TABLE opportunities (
  id                          BIGSERIAL PRIMARY KEY,
  ou_tag                      ou_tag NOT NULL DEFAULT 'envision',
  source                      TEXT NOT NULL,             -- 'sam_gov' | 'govtribe' | 'orangeslices' | 'manual'
  sam_notice_id               TEXT UNIQUE,
  naics                       TEXT,
  agency                      TEXT,
  sub_agency                  TEXT,
  title                       TEXT NOT NULL,
  description                 TEXT,
  set_aside                   TEXT,                      -- e.g. 'HUBZone SB', 'WOSB', '8(a)', 'SDVOSB', 'Total SB', 'Unrestricted'
  response_due_at             TIMESTAMPTZ,
  posted_at                   TIMESTAMPTZ,
  value_min                   NUMERIC(18,2),
  value_max                   NUMERIC(18,2),
  grade                       TEXT CHECK (grade IN ('A','B','C')),
  grade_evidence              TEXT,                      -- required when grade is set
  qualified_at                TIMESTAMPTZ,
  qualified_by                TEXT,
  is_partner_teaming_required BOOLEAN NOT NULL DEFAULT FALSE,
  teaming_partner             ou_tag,                    -- nullable; populated only when is_partner_teaming_required=true
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opps_naics          ON opportunities(naics);
CREATE INDEX idx_opps_agency         ON opportunities(agency);
CREATE INDEX idx_opps_set_aside      ON opportunities(set_aside);
CREATE INDEX idx_opps_response_due   ON opportunities(response_due_at);
CREATE INDEX idx_opps_grade          ON opportunities(grade);
CREATE INDEX idx_opps_qualified      ON opportunities(qualified_at) WHERE qualified_at IS NOT NULL;
CREATE INDEX idx_opps_ou_tag         ON opportunities(ou_tag);
```

#### 1b. `pipeline_items` table

```sql
CREATE TABLE pipeline_items (
  id                  BIGSERIAL PRIMARY KEY,
  ou_tag              ou_tag NOT NULL DEFAULT 'envision',
  opportunity_id      BIGINT NOT NULL REFERENCES opportunities(id),
  capture_owner       TEXT NOT NULL,
  milestones          JSONB NOT NULL DEFAULT '[]',       -- [{label, due_date, completed_at, notes}]
  win_prob_pct        INT CHECK (win_prob_pct BETWEEN 0 AND 100),
  win_prob_evidence   TEXT NOT NULL,                     -- required, no opinion-only
  teaming_partners    ou_tag[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pipeline_items_qualified_opp CHECK (opportunity_id IS NOT NULL)
);

CREATE INDEX idx_pipeline_opp        ON pipeline_items(opportunity_id);
CREATE INDEX idx_pipeline_owner      ON pipeline_items(capture_owner);
CREATE INDEX idx_pipeline_ou_tag     ON pipeline_items(ou_tag);
```

#### 1c. `partner_intel_profiles` table

```sql
CREATE TABLE partner_intel_profiles (
  ou_tag          ou_tag PRIMARY KEY,
  last_synced_at  TIMESTAMPTZ,
  certs           JSONB NOT NULL DEFAULT '[]',   -- [{name, expiration, status}]
  vehicles        JSONB NOT NULL DEFAULT '[]',   -- [{name, contract_number, ceiling, notes}]
  products        JSONB NOT NULL DEFAULT '[]',   -- [{name, description}]
  why_track       JSONB NOT NULL DEFAULT '{}'    -- {teaming_levers: [], capacity_notes: TEXT}
);
```

Seed on migration:

```sql
INSERT INTO partner_intel_profiles (ou_tag, last_synced_at, certs, vehicles, products, why_track) VALUES
(
  'riverstone',
  NOW(),
  '[
    {"name":"HUBZone","expiration":null,"status":"active"},
    {"name":"WOSB","expiration":null,"status":"active"},
    {"name":"SDB","expiration":null,"status":"active"},
    {"name":"ISO 9001:2015","expiration":null,"status":"active"},
    {"name":"CMMC RPO","expiration":null,"status":"active"},
    {"name":"CMMI-DEV ML3-aligned","expiration":null,"status":"active"}
  ]',
  '[
    {"name":"GSA MAS","contract_number":"47QTCA20D006F","ceiling":null,"notes":null},
    {"name":"MDA SHIELD IDIQ","contract_number":"HQ085926DF469","ceiling":null,"notes":"Prime. Won 12/2/2025."},
    {"name":"NASA CPSS","contract_number":null,"ceiling":null,"notes":null},
    {"name":"Air Force ABMS","contract_number":null,"ceiling":null,"notes":null},
    {"name":"Army FCoE Ft Sill","contract_number":null,"ceiling":null,"notes":null}
  ]',
  '[
    {"name":"Oxbow Security Platform","description":"TechSIGINT / cyber intelligence platform"},
    {"name":"SecurScale CaaS","description":"Scalable cloud-based security-as-a-service"}
  ]',
  '{"teaming_levers":["HUBZone set-aside unlock","MDA SHIELD IDIQ sub potential ($151B ceiling)","IC access / TechSIGINT depth","classified DevSecOps capacity"],"capacity_notes":"IC customer base: NSA, USCYBERCOM, NRO, IC components, NGA"}'
),
(
  'pd_systems',
  NOW(),
  '[
    {"name":"V3 Veteran","expiration":null,"status":"active"},
    {"name":"ISO 9001:2015","expiration":null,"status":"active"}
  ]',
  '[
    {"name":"Army RS3","contract_number":null,"ceiling":null,"notes":"Shared with Envision"},
    {"name":"EAGLE","contract_number":null,"ceiling":null,"notes":null},
    {"name":"SCOE II","contract_number":null,"ceiling":null,"notes":null},
    {"name":"TSS-E","contract_number":null,"ceiling":null,"notes":null},
    {"name":"63rd RD","contract_number":null,"ceiling":null,"notes":null},
    {"name":"SeaPort-NxG","contract_number":null,"ceiling":null,"notes":null},
    {"name":"GSA FSS","contract_number":null,"ceiling":null,"notes":null}
  ]',
  '[
    {"name":"XR/AR/VR Immersive Training Platform","description":"Digital twin and XR-based training systems"},
    {"name":"LVC Integration Suite","description":"Live, Virtual, Constructive integration for joint training centers"}
  ]',
  '{"teaming_levers":["V3 Veteran cert preference","300+ headcount surge capacity","training/simulation depth (XR/AR/VR, digital twin, LVC)","shared Army RS3 access"],"capacity_notes":"PEO STRI, TRADOC, CASCOM, Joint Training Centers, Special Operations"}'
)
ON CONFLICT (ou_tag) DO NOTHING;
```

#### 1d. `partner_awards` table

```sql
CREATE TABLE partner_awards (
  id             BIGSERIAL PRIMARY KEY,
  partner_ou_tag ou_tag NOT NULL REFERENCES partner_intel_profiles(ou_tag),
  contract_id    TEXT,
  customer       TEXT,
  value          NUMERIC(18,2),
  awarded_at     TIMESTAMPTZ,
  source         TEXT NOT NULL DEFAULT 'usaspending',
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_partner_awards_ou    ON partner_awards(partner_ou_tag);
CREATE INDEX idx_partner_awards_date  ON partner_awards(awarded_at DESC);
```

#### 1e. `partner_news_items` table

```sql
CREATE TABLE partner_news_items (
  id             BIGSERIAL PRIMARY KEY,
  partner_ou_tag ou_tag NOT NULL REFERENCES partner_intel_profiles(ou_tag),
  headline       TEXT NOT NULL,
  url            TEXT,
  source         TEXT,
  published_at   TIMESTAMPTZ,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_partner_news_ou      ON partner_news_items(partner_ou_tag);
CREATE INDEX idx_partner_news_pub     ON partner_news_items(published_at DESC);
```

#### 1f. `teaming_flags` table

```sql
CREATE TYPE teaming_flag_reason AS ENUM (
  'hubzone',
  'v3_veteran',
  'ic_clearance',
  'training_depth',
  'scope_overflow',
  'de_confliction'
);

CREATE TABLE teaming_flags (
  id                  BIGSERIAL PRIMARY KEY,
  opportunity_id      BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  suggested_partner   ou_tag NOT NULL REFERENCES partner_intel_profiles(ou_tag),
  reason              teaming_flag_reason NOT NULL,
  detail              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teaming_flags_opp    ON teaming_flags(opportunity_id);
CREATE INDEX idx_teaming_flags_partner ON teaming_flags(suggested_partner);
```

---

### 2. Sentinel — add new probes to `packages/backend/src/lib/health-sentinel.ts`

Add these probes to the existing `runSentinel()` function (do not modify existing probes):

- `opportunities_table_alive` — pass if `SELECT COUNT(*) FROM opportunities` executes without error
- `pipeline_table_alive` — pass if `SELECT COUNT(*) FROM pipeline_items` executes without error
- `partner_intel_seeded` — pass if `SELECT COUNT(*) FROM partner_intel_profiles` returns 2
- `teaming_flags_table_alive` — pass if `SELECT COUNT(*) FROM teaming_flags` executes without error

---

### 3. New module — `packages/backend/src/lib/teaming-engine.ts`

Single source of truth for teaming flag evaluation. Exported function:

```typescript
async function evaluateTeamingFlags(
  opportunityId: number,
  pool: Pool
): Promise<TeamingFlag[]>
```

Logic (evaluate in order):

1. **HUBZone check** — if `set_aside` contains `'HUBZone'` AND `partner_intel_profiles` for `'riverstone'` has cert `{name:'HUBZone',status:'active'}` → flag `(riverstone, 'hubzone', 'This opp is HUBZone set-aside. Riverstone (HUBZone certified) unlocks the bid.')`
2. **V3 Veteran check** — if `set_aside` contains `'V3'` or description contains `'veteran'` (case-insensitive) AND `pd_systems` has cert `{name:'V3 Veteran',status:'active'}` → flag `(pd_systems, 'v3_veteran', 'This opp wants V3 Veteran preference. PD Systems (V3 Veteran) strengthens the bid.')`
3. **IC clearance check** — if `description` or `title` contains keywords `['NSA','NRO','NGA','USCYBERCOM','IC ','intelligence community','classified','SCIFs']` (case-insensitive, any match) → flag `(riverstone, 'ic_clearance', 'Scope requires IC access or TechSIGINT. Riverstone (IC customer base, classified DevSecOps) is the natural sub.')`
4. **Training depth check** — if `description` or `title` contains keywords `['training','simulation','XR','VR','AR','LVC','immersive','digital twin','SERE','battlefield effects']` (case-insensitive, any match) → flag `(pd_systems, 'training_depth', 'Scope includes immersive training or LVC integration. PD Systems (300+ heads, XR/AR/VR depth) is the natural sub.')`
5. **De-confliction check** — query `partner_awards` for awards with overlapping `customer` + `naics` within the last 24 months → flag `(matching partner, 'de_confliction', 'Riverstone/PD Systems won similar scope under [contract_id] on [awarded_at]. Team or de-conflict?')`

Upsert flags into `teaming_flags` table after each evaluation (delete prior flags for this opportunity, then insert fresh). Return inserted flags.

Export this engine from `packages/backend/src/lib/teaming-engine.ts`; import it in the opportunities route so flags are evaluated on every `POST /qualify`.

---

### 4. New routes — `packages/backend/src/routes/opportunities.ts`

**Wire into `server.ts` like other routes.**

- `GET /api/opportunities` — returns paginated list. Query params: `naics`, `agency`, `set_aside`, `min_value`, `max_value`, `due_before`, `due_after`, `grade`, `qualified`, `ou_tag`. Default `ou_tag=envision`. Order by `response_due_at ASC NULLS LAST`.
- `POST /api/opportunities` — ingest a new opportunity. Auto-sets `ou_tag='envision'`. Returns 201 + created record. Triggers `evaluateTeamingFlags()` asynchronously (fire-and-forget — do not await in response path).
- `POST /api/opportunities/:id/qualify` — auth-protected (`x-gda-key`). Sets `qualified_at=NOW()`, `qualified_by` from request body. **Does NOT auto-create a pipeline item — Shawn does that from the Pipeline door.** Triggers `evaluateTeamingFlags()` synchronously (await, return flags in response alongside updated opp).
- `POST /api/opportunities/:id/grade` — auth-protected. Body: `{grade: 'A'|'B'|'C', grade_evidence: string}`. `grade_evidence` is required; reject 400 if absent. Sets `grade` + `grade_evidence`.

---

### 5. New routes — `packages/backend/src/routes/pipeline.ts`

**Wire into `server.ts` like other routes.**

- `GET /api/pipeline` — returns all pipeline items with joined opportunity data. Query params: `capture_owner`, `ou_tag`. Default `ou_tag=envision`. Order by `created_at DESC`.
- `POST /api/pipeline` — auth-protected. Body must include `opportunity_id`. **Enforce: the referenced opportunity must have `qualified_at IS NOT NULL` — return 422 if not qualified.** Sets `ou_tag` to the opportunity's `ou_tag` unless override provided. Sets `teaming_partners` to `['teaming']` automatically if opportunity `is_partner_teaming_required=true`.
- `PATCH /api/pipeline/:id` — auth-protected. Update `capture_owner`, `milestones`, `win_prob_pct`, `win_prob_evidence`, `teaming_partners`. `win_prob_evidence` required if `win_prob_pct` is being set; reject 400 if absent.
- `DELETE /api/pipeline/:id` — auth-protected. Hard delete (no soft delete needed for pipeline items at this stage).

---

### 6. New routes — `packages/backend/src/routes/partner-intel.ts`

**Wire into `server.ts` like other routes.**

- `GET /api/partner-intel/profiles` — returns both partner profiles (riverstone + pd_systems) in full.
- `GET /api/partner-intel/profiles/:ou_tag` — returns single partner profile. 404 if ou_tag is not `riverstone` or `pd_systems`.
- `POST /api/partner-intel/profiles/sync` — auth-protected. Body: `{ou_tag: 'riverstone'|'pd_systems'}`. Placeholder: sets `last_synced_at=NOW()`, returns the profile. (Real sync comes from n8n workflows in production.)
- `GET /api/partner-intel/awards` — paginated. Query params: `partner_ou_tag`, `page`, `per_page` (default 25). Order by `awarded_at DESC`.
- `POST /api/partner-intel/awards/batch` — auth-protected. Body: `{partner_ou_tag, awards: [...]}`. Upsert each award by `(contract_id, partner_ou_tag)`. Used by the n8n award sync workflow. Returns `{inserted, updated, skipped}` counts.
- `GET /api/partner-intel/teaming-flags` — query param: `opportunity_id` (required). Returns all flags for that opportunity with joined opportunity title.

---

### 7. Frontend — `pages/Opportunities.tsx`

Top to bottom:

1. **Page header** — "Opportunities" + pill badge showing total count
2. **Filter chip strip** — horizontal scrollable row of filter chips: NAICS (text input), Agency (text input), Set-Aside (multi-select: HUBZone, WOSB, 8(a), SDVOSB, Total SB, Unrestricted), Dollar range (min/max numeric inputs), Due date range (date pickers), Grade (A/B/C toggles). Active filters show as dismissible chips. "Clear all" button.
3. **Opportunity list** — each row/card shows: title, agency, set-aside badge, NAICS, value range, due date, grade badge (A=green/B=yellow/C=red), qualified badge if qualified. Teaming flag indicator (🤝 icon) if any teaming flags exist.
4. **Qualify modal** — clicking "Qualify" on an unqualified opp opens a modal: confirms title, asks for qualifier name, shows any teaming flags returned. On confirm: calls `POST /:id/qualify`, closes modal, refreshes list.
5. **Grade picker** — clicking "Grade" opens a small popover: radio A/B/C + required evidence text area. Calls `POST /:id/grade` on save. Reject submission if evidence is empty (frontend validation mirrors backend).
6. **Teaming flag badges** — if an opp has teaming flags, render them as small color-coded tags below the title: HUBZone (orange), V3 Veteran (blue), IC Clearance (purple), Training Depth (teal), De-Confliction (red).

Use existing component library. No new chart libraries. All times displayed as EST.

---

### 8. Frontend — `pages/Pipeline.tsx`

Top to bottom:

1. **Page header** — "Pipeline" + count badge
2. **Pipeline item list** — each item shows: opportunity title (linked), capture owner, win probability as a `<div>` progress bar (width = `win_prob_pct`%, color coded: <40% red, 40-69% yellow, ≥70% green), teaming partners tags, milestone count
3. **Capture plan editor** — clicking an item expands an inline edit panel (or side drawer): editable `capture_owner`, `win_prob_pct` (0-100 integer), `win_prob_evidence` (textarea, required), `teaming_partners` (multi-select: riverstone, pd_systems), milestones editor
4. **Milestone tracker** — milestones rendered as a table (NOT a chart):
   - Columns: Label | Due Date | Status | Notes
   - Status rendered as a `<div>` progress bar pill (pending/in-progress/done driven by `completed_at`)
   - Add milestone button appends a new row to the JSONB array
5. **"Add to Pipeline" CTA** — button at top links to Opportunities page filtered to qualified opps only (does not auto-create)

**No Gantt, no timeline chart, no ECharts on this page.** Milestones are table + `<div>` bars only. (Doctrine: no cartoon charts. Only ECharts where real data visualizations are justified.)

---

### 9. Frontend — `pages/PartnerIntel.tsx`

Top to bottom:

1. **Page header** — "Partner Intel" + subtitle: "Teaming radar. Riverstone and PD Systems are tracked as intel, not operated." + "Tracked, not operated" badge
2. **Two partner cards** (richer than Company Profile's Partners tab):
   - Header: anchor company name, CEO/HQ/founded, CAGE, UEI (if known)
   - **Identity block:** focus areas, role in enterprise
   - **Certification block:** table of certs with name + status + expiration (if known). Highlight teaming-lever certs in bold (HUBZone, V3 Veteran, IC-relevant).
   - **Vehicle block:** table of prime IDIQs/schedules with contract numbers and notes
   - **Products block:** product name + description
   - **"Why Envision Tracks" block:** bullet list from `why_track.teaming_levers`
3. **Awards feed** — paginated table: partner name, contract_id, customer, value, awarded_at, source. Filter by partner. "Last synced: [last_synced_at EST]" label. "Sync" button calls `POST /profiles/sync` (auth-gated — show x-gda-key prompt if needed).
4. **News feed** — chronological list: headline (linked), source, published_at. Filter by partner.
5. **Teaming triggers section** — rendered as a card per flag type:
   - HUBZone: "Riverstone (HUBZone) unlocks set-aside bids. [N] opps in queue with HUBZone set-aside."
   - V3 Veteran: "PD Systems (V3 Veteran) strengthens veteran-preference bids. [N] opps."
   - IC Clearance: "Riverstone (IC customer base) is the natural sub for IC-scope opps. [N] opps."
   - Training Depth: "PD Systems (300+ heads, XR/AR/VR) is the natural sub for training-scope opps. [N] opps."
   - Each card links to Opportunities filtered to that flag type.

---

### 10. n8n workflow stubs

Add the following JSON files to `docs/`. **Do not import to live n8n — Shawn will.**

#### `docs/n8n-sam-opp-ingest.json`

Schedule: hourly. Nodes:
1. **Cron trigger** — every 60 minutes
2. **SAM.gov Opportunities API** — `GET https://api.sam.gov/opportunities/v2/search` with `limit=100`, `postedFrom=[24h ago]`, `ptype=o,p,k`, `NAICS=[Envision primary NAICS]`, API key from env `SAM_API_KEY`
3. **Transform** — map SAM fields to `opportunities` schema (source='sam_gov', extract sam_notice_id, naics, agency, title, description, set_aside, response_due_at, posted_at, value_min/max)
4. **POST to GDA** — `POST {{$env.GDA_BASE_URL}}/api/opportunities` with `x-gda-key` header from credential `GDA Webhook Auth v2` (id `F4J3vYsPrJrYiO49`)
5. **Error handler** — log failures to n8n run log; do not email

#### `docs/n8n-partner-awards-sync.json`

Schedule: daily at 4:00 AM EST. Nodes:
1. **Cron trigger** — 9:00 UTC (4 AM EST)
2. **USAspending Riverstone** — `POST https://api.usaspending.gov/api/v2/search/spending_by_award/` body: `{"filters":{"award_type_codes":["A","B","C","D"],"recipient_search_text":["71WX3"]},"fields":["Award ID","Recipient Name","Award Amount","Awarding Agency","Action Date"],"limit":100}`
3. **USAspending PD Systems** — same endpoint, recipient `"4V8V7"`
4. **Transform Riverstone** — map to `partner_awards` schema: `partner_ou_tag='riverstone'`, source='usaspending'
5. **Transform PD Systems** — map: `partner_ou_tag='pd_systems'`, source='usaspending'
6. **POST Riverstone awards** — `POST {{$env.GDA_BASE_URL}}/api/partner-intel/awards/batch` with body `{partner_ou_tag: 'riverstone', awards: [...]}`
7. **POST PD Systems awards** — same
8. **Sync profile timestamps** — `POST {{$env.GDA_BASE_URL}}/api/partner-intel/profiles/sync` for each partner

#### `docs/n8n-partner-news-ingest.json`

Schedule: daily at 7:00 AM EST. Nodes:
1. **Cron trigger** — 12:00 UTC (7 AM EST)
2. **Filter existing news pipeline** — read from existing `news_items` table (already ingested via OrangeSlices); filter where headline or content mentions `'Riverstone Solutions'` OR `'PD Systems'` OR `'RSI '` OR `'Angela Rittenbach'`
3. **Transform Riverstone mentions** — map to `partner_news_items` schema: `partner_ou_tag='riverstone'`
4. **Transform PD Systems mentions** — map: `partner_ou_tag='pd_systems'`
5. **POST to GDA** — `POST {{$env.GDA_BASE_URL}}/api/partner-intel/news/batch` (Devin: add `POST /api/partner-intel/news/batch` route that upserts by `url` + `partner_ou_tag`, ignoring duplicates)
6. **Error handler** — log; do not email

---

### 11. Tests

#### `packages/backend/src/__tests__/opportunities.test.ts`

- `POST /api/opportunities` creates record with `ou_tag='envision'` by default
- `GET /api/opportunities` returns records; filter by `naics` returns correct subset
- `GET /api/opportunities` filter by `set_aside` returns correct subset
- `POST /:id/qualify` sets `qualified_at` and returns teaming flags
- `POST /:id/qualify` on already-qualified opp returns 200 (idempotent, updates `qualified_by`)
- `POST /:id/grade` without `grade_evidence` returns 400
- `POST /:id/grade` with evidence sets both `grade` and `grade_evidence`

#### `packages/backend/src/__tests__/pipeline.test.ts`

- `POST /api/pipeline` with unqualified opp returns 422
- `POST /api/pipeline` with qualified opp creates item
- `PATCH /api/pipeline/:id` setting `win_prob_pct` without `win_prob_evidence` returns 400
- `PATCH /api/pipeline/:id` with evidence updates record
- `DELETE /api/pipeline/:id` removes the record

#### `packages/backend/src/__tests__/partner-intel.test.ts`

- `GET /api/partner-intel/profiles` returns 2 profiles (riverstone + pd_systems)
- `GET /api/partner-intel/profiles/riverstone` returns CAGE `71WX3` in vehicles
- `GET /api/partner-intel/profiles/pd_systems` returns V3 Veteran cert
- `GET /api/partner-intel/profiles/envision` returns 404 (envision is not a partner profile)

#### `packages/backend/src/__tests__/teaming-engine.test.ts`

- HUBZone opp + Riverstone active HUBZone cert → flag `reason='hubzone'` created
- Training keywords in description + PD Systems V3 Veteran cert → flag `reason='training_depth'` created
- IC keywords in title + Riverstone IC cert → flag `reason='ic_clearance'` created
- V3 Veteran set-aside + PD Systems V3 cert → flag `reason='v3_veteran'` created
- Opp with no matching criteria → no flags created
- Flags are upserted (re-evaluate same opp → no duplicate flags)

Mock DB where appropriate. Do NOT hit live SAM.gov, USAspending.gov, or n8n in tests.

---

## Constraints

- **Do NOT touch** Launchpad / Company Profile / Sentinel modules from Sprint 1 (F-100), or F-038 ingestion, F-039 core probes, F-040 secret rotation.
- **Do NOT auto-promote** opportunities to pipeline — user qualifies manually via `POST /:id/qualify`, then creates pipeline item manually from the Pipeline door.
- **Do NOT modify** existing F-038/F-039/F-040 files.
- **All opportunities default `ou_tag='envision'`**. When `is_partner_teaming_required=true`, populate the `teaming_partner` field but **DO NOT change `ou_tag`** — it stays as whatever it was set to. Per doctrine: no auto-promotes, ever. Shawn changes `ou_tag` manually if needed.
- **`win_prob_pct` requires `win_prob_evidence`** at the route level; reject without it.
- **`grade` requires `grade_evidence`** at the route level; reject without it.
- Manual ingestion via universal drag-drop (F-038) must continue working; the new `opportunities` table is an additional target for document ingestion (add `opportunities` as a valid `target_collection` in the ingest router if it exists, otherwise do not modify F-038).
- **Do not rotate, regenerate, or touch any secrets.**
- **Do not import n8n workflow JSONs into live n8n — Shawn will.**
- All times stored as UTC; displayed as EST in frontend.
- Frontend pages use existing component library + Tailwind/ECharts (no new chart libraries).
- **No cartoon charts.** ECharts only where real data visualizations are justified. Pipeline milestone tracker uses `<div>` progress bars, NOT a chart. (Doctrine: Data First.)
- Partner cards on PartnerIntel page are richer than the read-only Partners tab in Company Profile, but carry the same "Tracked, not operated" ownership model.

---

## Deliverable

- One PR: `feature/F-101-sprint2-opps-pipeline-partner-intel`
- 5/5 CI green
- Tests pass
- Migrations apply cleanly forward AND reverse on local
- Self-review your PR before requesting review
- Open as draft if anything is uncertain — comment in PR with the question
- Include screenshots of Opportunities, Pipeline, and PartnerIntel pages in the PR description

---

## Acceptance criteria (how Shawn judges done)

1. ✅ `opportunities` table created with all columns; default `ou_tag='envision'`
2. ✅ `pipeline_items` table created; `POST /api/pipeline` with unqualified opp returns 422
3. ✅ `partner_intel_profiles` table seeded with Riverstone (CAGE 71WX3) and PD Systems (CAGE 4V8V7)
4. ✅ `partner_awards` and `partner_news_items` tables created
5. ✅ `teaming_flags` table created; HUBZone opp → Riverstone flag auto-generated on qualify
6. ✅ `GET /api/opportunities` with filter chips in UI returns correctly filtered results
7. ✅ `POST /:id/qualify` does NOT create a pipeline item — only sets `qualified_at`
8. ✅ `POST /:id/grade` without `grade_evidence` returns 400
9. ✅ `PATCH /api/pipeline/:id` setting win_prob without evidence returns 400
10. ✅ `GET /api/partner-intel/profiles` returns 2 profiles
11. ✅ PartnerIntel page shows both partner cards with teaming levers, awards feed, news feed, and teaming triggers section
12. ✅ Three n8n workflow stub JSONs in `docs/` directory
13. ✅ All tests in four test files pass
14. ✅ Sentinel reports four new probes all green

---

## Out of scope (do NOT touch this sprint)

- Capture door (RFP shredder, color review, pricing guardrails)
- Performance door
- Past Performance door
- Vehicles & IDIQs door
- Financial Bible
- Action Items door
- Agentic AI door
- Authentication / multi-user / role-based permissions
- Email/SMS/push alerting
- Editing partner cert/vehicle data directly in the UI (sync-only via n8n)
- Teaming worksheet generator (Sprint 3 Capture)
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
- `/home/user/workspace/gda/gda_company_profile_v1.md` — ground truth for all profile data (CAGE codes, certs, vehicles, financial targets)
- `/home/user/workspace/gda/doctrine_to_doors_map.md` — what each door must enforce (doors 1, 2, 12)
- `/home/user/workspace/gda/partner_intel_spec_v1.md` — full door 12 spec: what the door shows, what it does, what it does NOT do, data sources
- `/home/user/workspace/gda/F-100_Sprint1_OUTag_Sentinel_Launchpad_CompanyProfile_DevinPrompt.md` — Sprint 1 foundation (OU tag enum, Sentinel probes, Launchpad, Company Profile); read before touching any shared module
