# Phase 1 — V3 Architecture & Schema Design

**Program:** Backend V3 rebuild — see F-V3-PROGRAM tracker (#384)
**Phase:** 1 — Design
**Date:** 2026-05-29
**Author:** Devin (automated design)
**Status:** Draft — awaiting human sign-off before Phase 2

> **GATE:** No code may be written until this document receives human approval.

---

## Inherited binding scope (from Phase 0)

1. **Envision-only.** No `ou_tag`, no `ou_registry`, no multi-tenant patterns, no partner browsing pages. Riverstone and PD Systems appear only as `teaming_partners[]` lookup references on Envision opportunities.
2. **Root-cause only.** No symptom patches. Every design choice addresses why legacy broke.
3. **R1 native:** every fact table has native source columns (`source_kind`, `source_url`, `source_extracted_at`, `source_confidence`).
4. **R2 native:** every detail endpoint auto-runs analysis on open — no separate "run analysis" endpoint.
5. **Single migration tracker.** The dual `schema_migrations` + `_migrations` bug from prod is not reproducible in V3.

---

## 1. System overview

### High-level architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Operator (Shawn)                           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Traefik (reverse proxy)                       │
│              TLS termination · routing · rate limiting               │
├─────────────────┬───────────────────────────────┬───────────────────┤
│   gda.csr-llc.tech/*                            │ n8n.csr-llc.tech  │
│                 │                               │                   │
│   ┌─────────────▼─────────────┐   ┌─────────────▼─────────────┐    │
│   │   gda-frontend (Vite)     │   │         n8n               │    │
│   │   React SPA               │   │   Workflow engine          │    │
│   │   Static assets only      │   │   158 active workflows     │    │
│   └─────────────┬─────────────┘   └────────────┬──────────────┘    │
│                 │ /api/*                        │                   │
│                 ▼                               │                   │
│   ┌───────────────────────────┐                │                   │
│   │   gda-backend-v3          │◄───────────────┘                   │
│   │   Express + Node.js       │  HTTPS webhooks only               │
│   │   V3 API (all state)      │  (x-gda-key auth)                  │
│   └─────────────┬─────────────┘                                    │
│                 │ SQL (pg Pool)                                     │
│                 ▼                                                   │
│   ┌───────────────────────────┐                                    │
│   │   gda-postgres-v3         │                                    │
│   │   PostgreSQL 16 + pgvector│                                    │
│   │   V3 schema only          │                                    │
│   └───────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Key architectural rules

| Rule | Detail |
|---|---|
| **n8n never touches V3 DB directly** | All n8n writes go through HTTPS webhook endpoints on `gda-backend-v3`. No direct `INSERT`/`UPDATE`/`DELETE` from n8n to `gda-postgres-v3`. This eliminates the 63 shadow tables root cause. |
| **Single source of truth** | Every domain concept has exactly one table. No parallel `gda_*` shadow tables. |
| **Frontend → V3 API only** | React SPA calls only V3 API endpoints. No direct n8n webhook calls from the frontend. |
| **Traefik shared during cutover** | `gda-backend-v3` and `gda-postgres-v3` run alongside legacy containers during the 30-day soak period. Traefik routes to the active backend based on a single env var (`GDA_BACKEND_VERSION=v3`). |

### Container topology

| Container | Image | Port | Purpose |
|---|---|---|---|
| `gda-postgres-v3` | `postgres:16-alpine` + pgvector | 5433 (host) / 5432 (container) | V3 database — clean schema, no legacy tables |
| `gda-backend-v3` | Node.js 20 Alpine | 3002 (host) / 3001 (container) | V3 Express API |
| `gda-frontend` | Vite static build | 3000 | React SPA (shared — points to whichever backend is active) |
| `gda-postgres` | (legacy) | 5432 | Legacy database — retained during cutover, read-only after flip |
| `gda-backend` | (legacy) | 3001 | Legacy Express API — retained during cutover |
| `traefik` | Traefik v2 | 80/443 | Reverse proxy — routes by `GDA_BACKEND_VERSION` |
| `n8n` | n8n self-hosted | 5678 | Workflow engine — rewired to call V3 webhooks |

**Why this choice:** Legacy ran n8n with direct DB access, producing 63 shadow tables and three competing opportunity stores. The V3 topology enforces API-only access from n8n, eliminating shadow object creation at the infrastructure level. The dual-container cutover (legacy + V3 side-by-side, Traefik routing) avoids a big-bang migration and enables instant rollback. Phase 0 finding: "n8n has its own `N8N_DATABASE_URL` credential configured. Workflows can execute arbitrary SQL against the GDA database" — this is the root cause V3 eliminates.

---

## 2. Database schema (V3 initial)

All tables use `BIGSERIAL` primary keys (no text PKs — Phase 0 finding: legacy `opportunities.id` was `text`, causing FK type mismatches). All timestamps are `TIMESTAMPTZ` and stored in UTC (rendered in Eastern Time by the frontend per aesthetics canonical). Every fact table inherits R1 source columns.

### 2.1 `sources` — Canonical source registry

Every record in V3 cites a source from this table. This is the R1 backbone.

```sql
CREATE TABLE sources (
  id            BIGSERIAL     PRIMARY KEY,
  kind          TEXT          NOT NULL
                              CHECK (kind IN (
                                'sam_gov', 'fpds', 'usaspending', 'govwin',
                                'govtribe', 'news', 'doctrine', 'partner_site',
                                'internal', 'manual', 'n8n_workflow',
                                'dibbs', 'neco'
                              )),
  url           TEXT,                          -- clickable link to original record (NULL for internal/manual)
  title         TEXT,                          -- human-readable label ("SAM.gov W56HZV-24-R-0033")
  retrieved_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  confidence    TEXT          NOT NULL DEFAULT 'high'
                              CHECK (confidence IN ('high', 'medium', 'low')),
  meta          JSONB         NOT NULL DEFAULT '{}',  -- extensible payload (e.g., SAM notice ID, FPDS award ID)
  legacy_id     TEXT,                          -- V2 migration: original row ID for upsert dedup
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sources_kind      ON sources (kind);
CREATE INDEX idx_sources_url       ON sources (url) WHERE url IS NOT NULL;
CREATE INDEX idx_sources_retrieved  ON sources (retrieved_at DESC);
CREATE UNIQUE INDEX sources_legacy_id_uniq ON sources(legacy_id) WHERE legacy_id IS NOT NULL;
```

| Column | Purpose |
|---|---|
| `id` | Surrogate PK referenced by all fact tables via `source_id` FK |
| `kind` | Typed source origin per R1 spec (`product_rules.md`): `sam_gov`, `fpds`, `usaspending`, `govwin`, `govtribe`, `news`, `doctrine`, `partner_site`, `internal`, `manual`, `n8n_workflow`, `dibbs`, `neco` |
| `url` | Clickable link back to the original record. NULL only for `internal`/`manual` kinds where no URL exists |
| `title` | Human-readable label rendered in the UI next to the source badge |
| `retrieved_at` | When the data was fetched from the source — staleness detection |
| `confidence` | Grade of the source: `high` (official government DB), `medium` (third-party aggregator), `low` (news/manual) |
| `meta` | Extensible JSONB for source-specific metadata (SAM notice ID, FPDS contract number, etc.) |
| `legacy_id` | V2 migration: original row ID used for idempotent upserts via `ON CONFLICT`. NULL for V3-native records |

**Indexes:**
- `kind` — filter by source type (e.g., show all SAM.gov-sourced records)
- `url` partial — deduplicate sources by URL
- `retrieved_at DESC` — staleness queries ("sources older than 7 days")
- `sources_legacy_id_uniq` — unique partial index on `legacy_id` for migration upsert dedup

**Why this choice:** Phase 0 found R1 compliance was API-layer only (`SourceRef` interface in `analysis.ts`) with no DB-level enforcement. Tables had inconsistent `source_url` / `data_source` / `raw_source_url` columns. A canonical `sources` table with FK constraints ensures no unsourced record can exist in V3. This is the "Data First, Then Debate" doctrine made structural.

### 2.2 `users` — Operators

```sql
CREATE TABLE users (
  id                 BIGSERIAL     PRIMARY KEY,
  email              TEXT          NOT NULL UNIQUE,
  display_name       TEXT          NOT NULL,
  role               TEXT          NOT NULL DEFAULT 'operator'
                                   CHECK (role IN ('admin', 'operator', 'viewer')),
  is_active          BOOLEAN       NOT NULL DEFAULT TRUE,
  password_hash      TEXT,                          -- bcrypt hash; NULL = SSO-only
  failed_login_count INT           NOT NULL DEFAULT 0,
  locked_until       TIMESTAMPTZ,
  password_set_at    TIMESTAMPTZ,
  last_login_at      TIMESTAMPTZ,
  settings           JSONB         NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

| Column | Purpose |
|---|---|
| `id` | Surrogate PK; referenced by `audit_log.user_id` and all `created_by`/`updated_by` columns |
| `email` | Login identifier; unique constraint prevents duplicate accounts |
| `display_name` | Rendered in UI and audit log entries |
| `role` | RBAC: `admin` (Shawn — full access), `operator` (daily users), `viewer` (read-only) |
| `is_active` | Soft-disable without deleting (preserves audit trail) |
| `password_hash` | bcrypt hash for local auth; NULL when using external SSO |
| `failed_login_count` | Consecutive failed login attempts; resets on success |
| `locked_until` | Account lockout expiry (5 failures → 15 min lock) |
| `password_set_at` | Timestamp when password was last set/changed |
| `last_login_at` | Session tracking for security audit |
| `settings` | Per-user JSONB preferences (e.g. `briefing_auto_delivery`, `briefing_delivery_email`) |

**No indexes beyond PK + unique on email** — small table, full scans are negligible.

**Why this choice:** Legacy `users` table had 8 columns plus role extensions added in migration 019. V3 simplifies to a clean schema with explicit role CHECK constraint (no enum type needed for 3 values). Envision-only means no OU-scoped permissions — just admin/operator/viewer.

### 2.2b `auth_audit` — Authentication event log

```sql
CREATE TABLE auth_audit (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  event       TEXT NOT NULL CHECK (event IN ('login_success','login_failure','lockout','token_refresh','logout')),
  ip          INET,
  user_agent  TEXT,
  request_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_audit_user_idx ON auth_audit(user_id, created_at DESC);
CREATE INDEX auth_audit_email_idx ON auth_audit(email, created_at DESC);
```

| Column | Purpose |
|---|---|
| `user_id` | FK to users; NULL if login attempt for non-existent email |
| `email` | Email used in auth attempt (always recorded even if user doesn't exist) |
| `event` | Auth event type for security auditing |
| `ip` | Client IP address for forensics |
| `request_id` | Correlation ID for tracing |

### 2.3 `opportunities` — Envision pursuits

```sql
CREATE TABLE opportunities (
  id                  BIGSERIAL     PRIMARY KEY,
  title               TEXT          NOT NULL,
  agency              TEXT,
  sub_agency          TEXT,
  department          TEXT,
  solicitation_number TEXT,
  sam_notice_id       TEXT          UNIQUE,    -- SAM.gov unique notice ID for dedup
  status              TEXT          NOT NULL DEFAULT 'discovery'
                                    CHECK (status IN (
                                      'discovery', 'tracking', 'qualifying',
                                      'qualified', 'no_bid', 'closed', 'awarded'
                                    )),
  grade               TEXT          CHECK (grade IN ('A', 'B', 'C')),
  grade_evidence      TEXT,                    -- human-readable rationale for the grade
  value_min           NUMERIC,                 -- estimated floor ($)
  value_max           NUMERIC,                 -- estimated ceiling ($)
  naics               TEXT,                    -- primary NAICS code
  psc                 TEXT,                    -- product/service code
  set_aside           TEXT,                    -- e.g., "SB", "HUBZone", "8(a)"
  place_of_performance TEXT,
  response_due_at     TIMESTAMPTZ,             -- solicitation deadline
  posted_at           TIMESTAMPTZ,             -- when the notice was posted
  incumbent           TEXT,
  incumbent_confidence TEXT CHECK (incumbent_confidence IN ('high', 'medium', 'low')),
  incumbent_source    TEXT,
  description         TEXT,
  tags                TEXT[]        NOT NULL DEFAULT '{}',
  data_source         TEXT          NOT NULL DEFAULT 'manual',  -- ingest origin: 'sam', 'govtribe', 'govwin', 'dibbs', 'neco', 'manual'
  agency_subtype      TEXT,                    -- sub-classification: 'DLA', 'Navy', etc.
  opportunity_type    TEXT,                    -- e.g., 'RFQ', 'Synopsis'
  part_number         TEXT,                    -- DIBBS-specific part/NSN tracking
  quantity            NUMERIC,                 -- requested quantity (DIBBS/NECO)
  external_id         TEXT,                    -- non-SAM unique ID for dedup (DIBBS sol#, NECO RFQ#)
  source_uri          TEXT,                    -- deep-link to source page (GovTribe, GovWin, etc.)
  govtribe_id         TEXT,                    -- GovTribe entity ID for dedup + detail proxy
  analysis            JSONB,                   -- R2: cached auto-analysis result
  analysis_version    TEXT,                    -- analysis model version for cache invalidation
  ai_analyzed_at      TIMESTAMPTZ,             -- when analysis last ran
  is_teaming_required BOOLEAN       NOT NULL DEFAULT FALSE,
  qualified_at        TIMESTAMPTZ,             -- when opp was qualified (F-207)
  qualified_by        TEXT,                    -- who qualified it (user display name)
  source_id           BIGINT        NOT NULL REFERENCES sources(id),
  created_by          BIGINT        REFERENCES users(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ              -- soft delete
);

CREATE INDEX idx_opps_status         ON opportunities (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_agency         ON opportunities (agency) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_naics          ON opportunities (naics) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_set_aside      ON opportunities (set_aside) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_response_due   ON opportunities (response_due_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_grade          ON opportunities (grade) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_sam_notice     ON opportunities (sam_notice_id) WHERE sam_notice_id IS NOT NULL;
CREATE INDEX idx_opps_agency_subtype ON opportunities (agency_subtype) WHERE agency_subtype IS NOT NULL;
CREATE INDEX idx_opps_part_number    ON opportunities (part_number) WHERE part_number IS NOT NULL;
CREATE UNIQUE INDEX idx_opps_ext_id  ON opportunities (data_source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_opps_govtribe_id   ON opportunities (govtribe_id) WHERE govtribe_id IS NOT NULL;
CREATE INDEX idx_opps_source_uri    ON opportunities (source_uri) WHERE source_uri IS NOT NULL;
CREATE INDEX idx_opps_source         ON opportunities (source_id);
CREATE INDEX idx_opps_deleted        ON opportunities (deleted_at) WHERE deleted_at IS NOT NULL;
```

| Column | Purpose |
|---|---|
| `id` | `BIGSERIAL` PK — fixes legacy text PK that caused FK type mismatches |
| `sam_notice_id` | Unique SAM.gov notice ID for deduplication (legacy had no dedup key) |
| `status` | Lifecycle stage with CHECK constraint (legacy had free-text, no constraint) |
| `grade` / `grade_evidence` | A/B/C evidence-based qualification per Doctrine "Data First" |
| `value_min` / `value_max` | Range estimate replacing legacy single `value_estimated` |
| `analysis` | JSONB: R2 cached auto-analysis (pwin, incumbent, competitors, wargame, timeline) |
| `analysis_version` | Model version string for cache invalidation when analysis logic changes |
| `is_teaming_required` | Flag indicating this opp needs a teaming partner (replaces `teaming_flags` table logic) |
| `qualified_at` | When the opportunity was qualified (set by POST /v3/opportunities/:id/qualify) |
| `qualified_by` | Who qualified it (user display name from JWT claims) |
| `source_id` | **R1 FK** — every opportunity must cite its source. DB-enforced NOT NULL. |
| `deleted_at` | Soft delete (partial indexes exclude deleted rows from all queries) |

**Indexes:** All partial on `deleted_at IS NULL` — queries never scan deleted rows. Agency, NAICS, set-aside, grade support the Ops Tracker filter bar. `response_due_at DESC` powers deadline sorting.

**Why this choice:** Phase 0 found three competing opportunity tables (`sam_opportunities` 20,062 rows, `gda_opportunity_tracker` 1,924 rows, `opportunities` 658 rows). V3 consolidates to one. The legacy `text` PK and missing dedup key (`sam_notice_id`) caused FK type conflicts and duplicate records. The `BIGSERIAL` PK with `sam_notice_id` UNIQUE constraint eliminates both. The `analysis` JSONB + `analysis_version` supports R2 cache invalidation without a separate table.

### 2.4 `pipeline_items` — Qualified opportunities in active capture

```sql
CREATE TABLE pipeline_items (
  id                BIGSERIAL     PRIMARY KEY,
  opportunity_id    BIGINT        NOT NULL REFERENCES opportunities(id),
  capture_owner     TEXT          NOT NULL,    -- email of the assigned capture manager
  win_probability   NUMERIC       CHECK (win_probability >= 0 AND win_probability <= 100),
  win_prob_evidence TEXT,                      -- human rationale for the pwin number
  milestone_90day   TEXT,                      -- current 90-day milestone (Relentless Execution doctrine)
  estimated_value   NUMERIC,                   -- refined estimate for pipeline reporting
  stage             TEXT          NOT NULL DEFAULT 'qualifying'
                                  CHECK (stage IN (
                                    'qualifying', 'pursuit', 'proposal', 'submitted',
                                    'evaluation', 'won', 'lost'
                                  )),
  source_id         BIGINT        NOT NULL REFERENCES sources(id),
  created_by        BIGINT        REFERENCES users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pipeline_opp        ON pipeline_items (opportunity_id);
CREATE INDEX idx_pipeline_owner      ON pipeline_items (capture_owner);
CREATE INDEX idx_pipeline_stage      ON pipeline_items (stage);
CREATE INDEX idx_pipeline_source     ON pipeline_items (source_id);
```

| Column | Purpose |
|---|---|
| `opportunity_id` | FK to the parent opportunity — enforces "only qualified items reach pipeline" |
| `capture_owner` | Named individual owner (Doctrine: "Individual ownership, not committees") |
| `win_probability` | Evidence-backed pwin with constraint 0–100 |
| `win_prob_evidence` | Text rationale — "Data First" doctrine requires evidence, not optimism |
| `milestone_90day` | Current 90-day execution milestone per "Relentless Execution" doctrine |
| `stage` | Shipley-aligned pipeline stage with CHECK constraint |
| `source_id` | **R1 FK** — every pipeline item must cite its source |

**Why this choice:** Legacy `pipeline_items` (migration 129) had `ou_tag` column — removed per scope correction. Stage values align with the Shipley process lifecycle used by Envision. The 90-day milestone field enforces Doctrine Principle 5.

### 2.5 `captures` — Capture plans with color review state

```sql
CREATE TABLE captures (
  id                BIGSERIAL     PRIMARY KEY,
  pipeline_item_id  BIGINT        NOT NULL REFERENCES pipeline_items(id),
  color_stage       TEXT          NOT NULL DEFAULT 'pink'
                                  CHECK (color_stage IN ('pink', 'red', 'gold', 'submitted')),
  capture_plan      JSONB         NOT NULL DEFAULT '{}',  -- structured capture plan data
  pricing_notes     TEXT,
  compliance_status TEXT          NOT NULL DEFAULT 'incomplete'
                                  CHECK (compliance_status IN ('incomplete', 'partial', 'complete')),
  win_themes        TEXT[],                    -- key win themes for this pursuit
  ghost_team        JSONB,                     -- competitor "black hat" analysis
  entry_point       TEXT          NOT NULL DEFAULT 'full_pipeline'
                                  CHECK (entry_point IN ('full_pipeline', 'white_only')),
  rfp_filename      TEXT,
  rfp_text          TEXT,
  rfp_uploaded_at   TIMESTAMPTZ,
  source_id         BIGINT        NOT NULL REFERENCES sources(id),
  created_by        BIGINT        REFERENCES users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_captures_pipeline   ON captures (pipeline_item_id);
CREATE INDEX idx_captures_color      ON captures (color_stage);
CREATE INDEX idx_captures_source     ON captures (source_id);
```

| Column | Purpose |
|---|---|
| `pipeline_item_id` | FK to pipeline — captures only exist for pipeline-qualified opportunities |
| `color_stage` | Pink → Red → Gold → Submitted color review lifecycle |
| `capture_plan` | JSONB structured plan (allows flexible fields without schema changes) |
| `compliance_status` | Tracks whether all RFP requirements have been mapped |
| `win_themes` | Array of pursuit-specific win themes for proposal alignment |
| `ghost_team` | JSONB competitor analysis ("black hat" per Capture doctrine) |
| `source_id` | **R1 FK** — source of the capture plan data |

**Why this choice:** Legacy had separate `capture_plans` (FK to `opportunities_legacy`) and `captures` (FK to `pipeline_items`) — two competing capture concepts. V3 unifies to one `captures` table linked through the pipeline chain: `opportunity → pipeline_item → capture`. The `color_stage` CHECK replaces the `color_review_stage` enum that never landed in prod.

### 2.6 `compliance_items` — RFP requirement breakdown per capture

```sql
CREATE TABLE compliance_items (
  id              BIGSERIAL     PRIMARY KEY,
  capture_id      BIGINT        NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  requirement     TEXT          NOT NULL,      -- extracted RFP requirement text
  section_ref     TEXT,                        -- RFP section reference (e.g., "L.3.2")
  status          TEXT          NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'addressed', 'non_compliant', 'waived')),
  response_notes  TEXT,                        -- how we address this requirement
  assigned_to     TEXT,                        -- email of responsible person
  source_id       BIGINT        NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_capture  ON compliance_items (capture_id);
CREATE INDEX idx_compliance_status   ON compliance_items (status);
CREATE INDEX idx_compliance_source   ON compliance_items (source_id);
```

| Column | Purpose |
|---|---|
| `capture_id` | FK to parent capture; CASCADE delete removes compliance items when capture is deleted |
| `requirement` | Verbatim extracted RFP requirement text (from RFP Shredder) |
| `section_ref` | RFP section number for traceability |
| `status` | Compliance lifecycle: `open` → `addressed` / `non_compliant` / `waived` |
| `response_notes` | How Envision addresses this requirement in the proposal |
| `assigned_to` | Individual owner per Doctrine "Relentless Execution" |
| `source_id` | **R1 FK** — cites the RFP document source |

**Why this choice:** Phase 0 found `compliance_items` (migration 130) never landed in prod. The legacy `compliance_requirements` table and `extracted_requirements` table served overlapping purposes. V3 unifies RFP requirement tracking into one table chained to captures.

### 2.7 `action_items` — Drag-from-email or manual to-dos

```sql
CREATE TABLE action_items (
  id              BIGSERIAL     PRIMARY KEY,
  title           TEXT          NOT NULL,
  body            TEXT,
  detail          TEXT,                        -- v3 service detail column (parallel to legacy body)
  owner_email     TEXT          NOT NULL,      -- individual accountability (not committee)
  owner           TEXT,                        -- v3 service owner column (synced with owner_email)
  status          TEXT          NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'in_progress', 'done', 'blocked')),
  priority        TEXT          NOT NULL DEFAULT 'normal'
                                CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW',
                                                    'critical', 'high', 'normal', 'low')),
  due_date        TIMESTAMPTZ,
  origin          TEXT          NOT NULL DEFAULT 'manual'
                                CHECK (origin IN ('email', 'manual', 'sentinel', 'launchpad', 'n8n')),
  origin_ref      TEXT,                        -- reference ID from the origin system
  source          TEXT,                        -- v3 service source column (parallel to legacy origin)
  opportunity_id  BIGINT        REFERENCES opportunities(id),
  partner_context TEXT,                        -- e.g., "ask Angela about SHIELD task order capacity"
  source_type     TEXT,                        -- F-611: auto-gen source type (opportunity|risk|award|capture)
  is_auto         BOOLEAN       NOT NULL DEFAULT FALSE,  -- F-611: TRUE for system-generated items
  assignee_id     BIGINT        REFERENCES users(id),    -- F-611: assigned user for the action item
  linked_record_type TEXT,                     -- v3: entity type for linked record (mirrors source_type)
  linked_record_id   TEXT,                     -- v3: entity id for linked record (text, avoids legacy bigint FK)
  source_id       BIGINT        REFERENCES sources(id),  -- nullable after v3_062 (v3 uses linked_record_id)
  created_by      BIGINT        REFERENCES users(id),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_actions_status      ON action_items (status) WHERE status != 'done';
CREATE INDEX idx_actions_owner       ON action_items (owner_email);
CREATE INDEX idx_actions_due         ON action_items (due_date) WHERE status != 'done';
CREATE INDEX idx_actions_opp         ON action_items (opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX idx_actions_source      ON action_items (source_id);
```

| Column | Purpose |
|---|---|
| `owner_email` | Individual owner — Doctrine "Relentless Execution" forbids committee-owned items |
| `owner` | v3 service owner column (synced with `owner_email` on write) |
| `detail` | v3 service detail text (parallel to legacy `body`) |
| `source` | v3 service source label (parallel to legacy `origin`) |
| `status` | Lifecycle: `open` → `in_progress` → `done` / `blocked` |
| `priority` | Triage level for launchpad sorting (accepts UPPER and lower case) |
| `origin` | How the item was created: email drag, manual, sentinel alert, launchpad flag, n8n workflow |
| `origin_ref` | Back-reference to the originating email/alert/flag ID |
| `opportunity_id` | Optional FK linking the action item to a specific opportunity |
| `partner_context` | Free text for cross-OU action items (e.g., "ask Angela about SHIELD capacity") per Partner Intel spec |
| `source_type` | F-611: auto-gen source type (`opportunity`, `risk`, `award`, `capture`) |
| `is_auto` | F-611: `TRUE` for system-generated items, `FALSE` for manual |
| `assignee_id` | F-611: FK to `users(id)` — assigned user for the action item |
| `linked_record_type` | v3: entity type for linked record (mirrors `source_type`) |
| `linked_record_id` | v3: text entity id for linked record (avoids legacy bigint `source_id` FK) |
| `source_id` | **R1 FK** — cites the source of the action item (nullable after v3_062) |

**Indexes:** Partial indexes on `status != 'done'` — active items are the hot set. Due date index supports launchpad "overdue items" queries.

**Why this choice:** Phase 0 found two competing action item tables (`action_items` from migration 130, `gda_action_items` from migration 066). Neither existed in prod. V3 unifies to one table. The `origin` CHECK replaces the `action_source` enum that never landed. The `partner_context` text field replaces the removed `ou_tag` scoping while preserving the Teamwork doctrine surface.

### 2.8 `action_item_drafts` — LLM-drafted replies/research/milestones

```sql
CREATE TABLE action_item_drafts (
  id              BIGSERIAL     PRIMARY KEY,
  action_item_id  BIGINT        NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  kind            TEXT          NOT NULL
                                CHECK (kind IN ('reply', 'research', 'milestone')),
  status          TEXT          NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
  content         TEXT          NOT NULL,      -- the LLM-generated draft
  model_used      TEXT,                        -- e.g., "gpt-4o", "claude-3.5-sonnet"
  approved_by     BIGINT        REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  source_id       BIGINT        NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drafts_action       ON action_item_drafts (action_item_id);
CREATE INDEX idx_drafts_status       ON action_item_drafts (status) WHERE status = 'pending';
CREATE INDEX idx_drafts_source       ON action_item_drafts (source_id);
```

| Column | Purpose |
|---|---|
| `action_item_id` | FK to parent action item; CASCADE delete |
| `kind` | Draft type: `reply` (email response), `research` (background research), `milestone` (90-day milestone suggestion) |
| `status` | Human-in-the-loop gate: `pending` → `approved` / `rejected` |
| `content` | The LLM-generated text |
| `model_used` | Traceability for which LLM produced the draft |
| `approved_by` / `approved_at` | Audit trail for who approved the AI output |
| `source_id` | **R1 FK** — cites the source context the LLM used |

**Why this choice:** Legacy `action_item_drafts` (migration 130) used `draft_kind` and `draft_status` enums that never landed in prod. V3 uses CHECK constraints instead of custom enum types — simpler to manage, no migration needed to add values.

### 2.9 `partners` — Lookup-only teaming partner reference

```sql
CREATE TABLE partners (
  id              BIGSERIAL     PRIMARY KEY,
  name            TEXT          NOT NULL UNIQUE,     -- "Riverstone Solutions", "PD Systems"
  anchor_company  TEXT          NOT NULL,
  ceo             TEXT,
  hq_location     TEXT,
  founded_year    INTEGER,
  uei             TEXT,
  cage            TEXT,
  duns            TEXT,
  naics_codes     TEXT[]        NOT NULL DEFAULT '{}',
  certifications  JSONB         NOT NULL DEFAULT '[]',  -- [{name, status, expires_at, source_url}]
  vehicles        JSONB         NOT NULL DEFAULT '[]',  -- [{name, contract_number, ceiling, source_url}]
  capabilities    TEXT[],                    -- focus areas
  contact_info    JSONB         NOT NULL DEFAULT '{}',  -- {email, phone, address}
  notes           TEXT,
  source_id       BIGINT        NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

| Column | Purpose |
|---|---|
| `name` | Partner display name; UNIQUE constraint prevents duplicates |
| `certifications` | JSONB array: each entry has `name`, `status`, `expires_at`, `source_url` — the teaming-lever data (HUBZone, WOSB, V3 Veteran, etc.) |
| `vehicles` | JSONB array: IDIQs and GSA schedules the partner holds |
| `capabilities` | Text array of focus areas for scope-matching |
| `source_id` | **R1 FK** — cites where partner data was sourced (SAM.gov, manual, etc.) |

**No partner browsing indexes** — this is a lookup table with only 2 rows (Riverstone, PD Systems). Full scan is instant.

**Why this choice:** Phase 0 scope correction demoted `partner_intel_profiles` from a browsable page to a read-only lookup. The `partners` table stores just enough data to enrich teaming context on opportunities. No `partner_awards`, no `partner_news_items` (explicitly excluded). JSONB for certs/vehicles allows flexible structure without joining to additional tables — appropriate for a 2-row lookup table.

### 2.10 `teaming_attachments` — Join: opportunity ↔ partner ↔ reason

```sql
CREATE TABLE teaming_attachments (
  id              BIGSERIAL     PRIMARY KEY,
  opportunity_id  BIGINT        NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  partner_id      BIGINT        NOT NULL REFERENCES partners(id),
  reason          TEXT          NOT NULL,      -- why this partner is attached (HUBZone unlock, surge capacity, etc.)
  role            TEXT          NOT NULL DEFAULT 'subcontractor'
                                CHECK (role IN ('subcontractor', 'prime', 'mentor', 'joint_venture')),
  status          TEXT          NOT NULL DEFAULT 'proposed'
                                CHECK (status IN ('proposed', 'confirmed', 'declined')),
  source_id       BIGINT        NOT NULL REFERENCES sources(id),
  created_by      BIGINT        REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (opportunity_id, partner_id)
);

CREATE INDEX idx_teaming_opp         ON teaming_attachments (opportunity_id);
CREATE INDEX idx_teaming_partner     ON teaming_attachments (partner_id);
CREATE INDEX idx_teaming_source      ON teaming_attachments (source_id);
```

| Column | Purpose |
|---|---|
| `opportunity_id` | FK to the Envision opportunity; CASCADE delete |
| `partner_id` | FK to the partner being brought onto the team |
| `reason` | Human-readable rationale: "HUBZone set-aside unlock", "surge capacity for training scope", etc. |
| `role` | Partner's role in the teaming arrangement |
| `status` | Lifecycle: `proposed` → `confirmed` / `declined` |
| `UNIQUE (opportunity_id, partner_id)` | Prevents duplicate attachments |
| `source_id` | **R1 FK** — cites the decision source |

**Why this choice:** Phase 0 found `teaming_flags` was the "only legitimate use of partner data in the tool." This join table replaces both `teaming_flags` and the `gda_teaming_partners` shadow table with a clean many-to-many relationship. The `reason` field replaces the `teaming_flag_reason` enum that never landed in prod.

### 2.11 `launchpad_flags` — Today-actionable items

```sql
CREATE TABLE launchpad_flags (
  id              BIGSERIAL     PRIMARY KEY,
  flag_type       TEXT          NOT NULL
                                CHECK (flag_type IN ('cert_expiry', 'deadline', 'action_overdue', 'teaming_alert', 'system_alert')),
  severity        TEXT          NOT NULL
                                CHECK (severity IN ('critical', 'warning', 'info')),
  title           TEXT          NOT NULL,
  body            TEXT,
  entity_type     TEXT,                        -- 'opportunity', 'action_item', 'cert', etc.
  entity_id       BIGINT,                      -- polymorphic reference to the flagged entity
  doctrine_anchor TEXT,                        -- which doctrine principle this flag enforces
  source_id       BIGINT        NOT NULL REFERENCES sources(id),
  source_url      TEXT,                        -- direct link for the flag (convenience duplicate from source)
  dismissed_at    TIMESTAMPTZ,
  dismissed_by    BIGINT        REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flags_active        ON launchpad_flags (severity, created_at DESC) WHERE dismissed_at IS NULL;
CREATE INDEX idx_flags_type          ON launchpad_flags (flag_type) WHERE dismissed_at IS NULL;
CREATE INDEX idx_flags_entity        ON launchpad_flags (entity_type, entity_id) WHERE dismissed_at IS NULL;
CREATE INDEX idx_flags_source        ON launchpad_flags (source_id);
```

| Column | Purpose |
|---|---|
| `flag_type` | Category of the flag — cert expiry, deadline, action overdue, teaming alert, system alert |
| `severity` | `critical` (red banner per aesthetics canonical), `warning` (amber badge), `info` (muted text) |
| `entity_type` / `entity_id` | Polymorphic reference to what the flag is about (e.g., entity_type='cert', entity_id=NULL for CIO-SP3 expiry) |
| `doctrine_anchor` | Which doctrine principle this flag enforces (e.g., "Ethics Always — expired certs must be flagged") |
| `source_url` | Convenience direct link (also available via `source_id → sources.url`) |
| `dismissed_at` / `dismissed_by` | Audit trail for flag dismissal |

**Indexes:** All partial on `dismissed_at IS NULL` — launchpad only shows active flags.

**Why this choice:** Legacy `launchpad_flags` (migration 127) had `ou_tag` — removed per scope correction. The Day-1 flags (CIO-SP3 expired, CMMI-DEV ML3 expiring, Mentor-Protégé urgent) will be seeded in the initial migration.

### 2.12 `audit_log` — Every write captured

```sql
CREATE TABLE audit_log (
  id              BIGSERIAL     PRIMARY KEY,
  user_id         BIGINT        REFERENCES users(id),
  action          TEXT          NOT NULL,      -- 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'DISMISS', etc.
  table_name      TEXT          NOT NULL,
  record_id       BIGINT,                      -- the affected record's PK
  old_values      JSONB,                       -- previous state (for UPDATE/DELETE)
  new_values      JSONB,                       -- new state (for INSERT/UPDATE)
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user          ON audit_log (user_id);
CREATE INDEX idx_audit_table         ON audit_log (table_name, created_at DESC);
CREATE INDEX idx_audit_record        ON audit_log (table_name, record_id) WHERE record_id IS NOT NULL;
CREATE INDEX idx_audit_created       ON audit_log (created_at DESC);
```

| Column | Purpose |
|---|---|
| `user_id` | Who performed the action; NULL for system/n8n actions |
| `action` | What happened — INSERT, UPDATE, DELETE, plus app-level actions like LOGIN, DISMISS |
| `table_name` / `record_id` | Which record was affected |
| `old_values` / `new_values` | Full before/after state for audit trail |
| `ip_address` / `user_agent` | Security audit — who connected from where |

**Indexes:** `table_name + created_at` for "show all changes to opportunities in the last 24 hours." `table_name + record_id` for "show all changes to this specific opportunity."

**Why this choice:** Legacy `audit_log` existed but had limited coverage. Legacy `record_version` (26 MB, 16,425 rows in prod) was a heavy versioning system with triggers. V3 replaces both with a simpler append-only log. Write-time capture in application code (not DB triggers) ensures consistent behavior and avoids the "duplicate trigger" bug from migration 043.

### 2.13 `schema_versions` — Single migration tracker

```sql
CREATE TABLE schema_versions (
  id              SERIAL        PRIMARY KEY,
  filename        TEXT          NOT NULL UNIQUE,
  file_sha256     TEXT          NOT NULL,      -- integrity verification
  applied_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  applied_by      TEXT          NOT NULL DEFAULT current_user,
  commit_sha      TEXT,                        -- git commit that deployed this migration
  execution_ms    INTEGER                      -- how long the migration took
);
```

| Column | Purpose |
|---|---|
| `filename` | Migration filename — UNIQUE constraint prevents double-apply |
| `file_sha256` | SHA-256 hash of the migration SQL at apply time — detects tampering |
| `applied_by` | Postgres role that ran the migration — unforgeable audit |
| `commit_sha` | Git commit for deployment traceability |
| `execution_ms` | Performance tracking for slow migrations |

**Why this choice:** Phase 0 found the root cause of migrations 127–134 not landing: two competing tracker tables (`schema_migrations` with 128 rows, `_migrations` with 22 rows). V3 uses a single `schema_versions` table with a distinct name (not `schema_migrations` or `_migrations`) to avoid any confusion with legacy trackers. The `file_sha256` column and `UNIQUE` on filename make it impossible to silently skip or double-apply migrations.

---

## Migration file cross-references (F-205)

The following migration files in `db/v3/migrations/` materialize this schema:

| Migration | Contents |
|-----------|----------|
| `v3_000_schema_migrations.sql` | Bootstrap `v3_schema_migrations` tracker table (implements §2.13 `schema_versions` under the F-205 name) |
| `v3_001_initial.sql` | Core tables: `sources`, `users`, `opportunities`, `pipeline_items`, `captures`, `compliance_items`, `action_items`, `action_item_drafts`, `partners`, `teaming_attachments`, `launchpad_flags`, `audit_log` + all indexes (§2.1–§2.12) |
| `v3_002_analysis_cache.sql` | R2 contract: `opportunity_analysis_cache`, `capture_analysis_cache` (Addendum A) |
| `v3_003_source_siblings.sql` | R1 per-field source join tables for analysis and opportunity data fields (F-202 OpenAPI spec) |
| `v3_004_pgboss_bootstrap.sql` | `analysis_jobs` table (pg-boss companion). pg-boss schema is self-managed at runtime via `boss.start()` — see `db/v3/README.md` (Strategy B, F-220.1) |

CI enforcement: `.github/workflows/v3-schema-drift.yml` runs the drift detector (`scripts/v3-schema-diff.ts`) on every PR to ensure the live schema matches this document.

---

## 3. Migration system design

### 3.1 Single canonical tracker: `schema_versions`

The V3 migration runner uses exactly one tracker table: `schema_versions` (Section 2.13). The table name is deliberately different from both legacy trackers (`schema_migrations`, `_migrations`) to guarantee no confusion during the cutover period when both V2 and V3 databases may be live.

### 3.2 Migration runner behavior

The V3 migration runner (`packages/backend-v3/src/db/migrate.ts`) follows this algorithm:

1. **Connect** to `V3_DATABASE_URL` (never the legacy `DATABASE_URL`).
2. **Bootstrap** `schema_versions` if it does not exist (idempotent `CREATE TABLE IF NOT EXISTS`). This is the only `IF NOT EXISTS` allowed in the entire migration system.
3. **Read** all filenames from `schema_versions` into a set.
4. **Scan** the `migrations/` directory for `NNN_descriptive.sql` files, sorted lexicographically.
5. **For each unapplied migration:**
   a. Compute `SHA-256` of the file contents.
   b. **Pre-flight check:** Run `EXPLAIN` on every SQL statement in the migration against the live database. If any statement fails to plan (syntax error, missing table/column reference), abort with a clear error. Do not apply.
   c. **BEGIN** transaction.
   d. Execute the migration SQL.
   e. **INSERT** into `schema_versions` (filename, sha256, applied_by, commit_sha, execution_ms).
   f. **COMMIT**.
6. If any migration fails, **ROLLBACK** and exit with error code 1. Do not continue to subsequent migrations.

### 3.3 File naming convention

```
NNN_descriptive.sql
```

- `NNN` = zero-padded sequential number starting at `001`.
- `descriptive` = lowercase snake_case description.
- First migration: `001_v3_initial.sql` (creates all tables from Section 2).
- Subsequent migrations: `002_add_opportunity_vehicle_type.sql`, `003_seed_day1_launchpad_flags.sql`, etc.

### 3.4 Forbidden patterns

| Pattern | Why forbidden | Phase 0 evidence |
|---|---|---|
| `CREATE TABLE IF NOT EXISTS` (for schema mutations) | Silently no-ops when table exists with wrong columns. Masks drift. | Migration 129 used this pattern. Legacy `opportunities` existed with wrong schema — the guard clause silently did nothing, leaving the old text-PK table in place. |
| `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | Silently no-ops when column exists with wrong type/constraints. | F-107 hotfix added these guards as symptom patches instead of fixing root cause. |
| `DROP TABLE IF EXISTS` as a precondition | Destroys data silently. | Not observed in legacy but must be explicitly forbidden. |
| Conditional `RENAME` with guard clauses | Can silently no-op, leaving the old name in place. | Migration 129 renamed `opportunities` → `opportunities_legacy` but only on dev — prod kept the old name because migration never applied. |
| Dual-purpose migrations (DDL + DML in one file) | Makes rollback ambiguous — did the data change or just the schema? | Migrations 027/028 mixed `DELETE` with schema changes. |
| Any reference to `schema_migrations` or `_migrations` | Must use `schema_versions` only. | Legacy had two trackers — this prevents accidental reconnection. |

### 3.5 Pre-flight check

Before applying any migration, the runner executes `EXPLAIN` on each SQL statement (parsed by splitting on `;` and filtering empty statements). The `EXPLAIN` validates:

- All referenced tables exist.
- All referenced columns exist with compatible types.
- All referenced indexes, constraints, and functions exist.

If `EXPLAIN` fails for any statement, the migration is rejected before execution. This catches drift between the expected schema state and the actual live database — the exact scenario that caused migrations 127–130 to silently fail in legacy prod.

**Exception:** `CREATE TABLE`, `CREATE INDEX`, `CREATE TYPE`, and `ALTER TABLE ADD COLUMN` statements cannot be `EXPLAIN`'d (they are DDL, not DML). For these, the runner validates syntax only (parser check) and confirms that referenced parent tables/types exist via `information_schema` queries.

**Why this choice:** Phase 0 root cause — migrations 127–130 assumed a schema state that didn't match prod (because prior migrations hadn't applied due to the dual-tracker bug). Pre-flight `EXPLAIN` would have caught this immediately.

---

## 4. Source attribution model (R1 native)

### 4.1 `sources` table schema

See Section 2.1 for full DDL. The `sources` table is the canonical registry of every external and internal data source. Every source has a `kind`, optional `url`, `retrieved_at` timestamp, and `confidence` grade.

### 4.2 How every fact-table row references a source

Every fact table (`opportunities`, `pipeline_items`, `captures`, `compliance_items`, `action_items`, `action_item_drafts`, `partners`, `teaming_attachments`, `launchpad_flags`) has a `source_id BIGINT NOT NULL REFERENCES sources(id)` column.

The `NOT NULL` constraint is the key enforcement: **a row cannot be inserted without a source reference.** This is a DB-level constraint, not application-level validation. The application cannot bypass it.

**Insertion flow:**

1. Ingest endpoint (or manual creation) receives data with source metadata.
2. Application upserts a `sources` row (dedup on `kind` + `url` + `retrieved_at` window).
3. Application inserts the fact-table row with `source_id` pointing to the upserted source.
4. If step 3 is attempted without step 2, the FK constraint rejects the insert.

### 4.3 Validation enforcement

| Level | Mechanism | What it catches |
|---|---|---|
| **DB constraint** | `source_id BIGINT NOT NULL REFERENCES sources(id)` | Any attempt to insert a row without a valid source reference |
| **Application validation** | Pre-insert check that `source_id` exists and is not stale | Prevents referencing a source older than the configurable staleness threshold |
| **API response** | Every list/detail endpoint includes `source` object with `kind`, `url`, `title`, `retrieved_at`, `confidence` | Frontend always has source data to render |

### 4.4 How API responses surface source URLs per field

Every V3 API response that returns fact data includes a `source` field:

```json
{
  "id": 42,
  "title": "Army Sustainment Command — Next Gen Logistics",
  "agency": "Department of the Army",
  "source": {
    "kind": "sam_gov",
    "url": "https://sam.gov/opp/abc123/view",
    "title": "SAM.gov W56HZV-24-R-0033",
    "retrieved_at": "2026-05-29T14:30:00Z",
    "confidence": "high"
  }
}
```

For list endpoints, each item in the array carries its own `source` object. The frontend renders this as a clickable source badge per the R1 spec.

**Why this choice:** Phase 0 Section 7 found R1 compliance was API-layer only (a `SourceRef` TypeScript interface in `analysis.ts`). Tables had inconsistent source columns: `opportunities` had `source` (text), `opportunities_legacy` had `raw_source_url` + `data_source`, `pipeline_items` had `win_prob_evidence`, partner tables had none. The canonical `sources` table with FK constraints makes R1 structurally unforgeable — the DB rejects unsourced data before the application layer even runs.

---

## 5. Auto-analysis model (R2 native)

### 5.1 Where analysis state lives

Analysis state lives directly on the `opportunities` table in the `analysis` JSONB column, with `analysis_version` and `ai_analyzed_at` as companion columns.

```
opportunities.analysis          JSONB   — full analysis result (pwin, incumbent, competitors, wargame, timeline)
opportunities.analysis_version  TEXT    — model version string (e.g., "v3.2026.05")
opportunities.ai_analyzed_at    TIMESTAMPTZ — when analysis last completed
```

**No separate `opportunity_analyses` table.** The analysis is tightly coupled to the opportunity and always returned with it — a separate table would require a JOIN on every detail request for no benefit.

### 5.2 When analysis triggers

Analysis runs **server-side on the detail endpoint open** (`GET /api/v3/opportunities/:id`):

1. Frontend requests `GET /api/v3/opportunities/:id`.
2. Backend checks: does `analysis` exist AND is `ai_analyzed_at` newer than `updated_at` AND does `analysis_version` match the current model version?
3. **If cached and fresh:** Return the opportunity with `analysis` immediately (p50 < 50ms).
4. **If stale or missing:** Return the opportunity with `analysis: null` AND trigger an async background analysis job. The response includes `"analysis_status": "running"`.
5. Frontend polls `GET /api/v3/opportunities/:id` at 2-second intervals until `analysis` is populated (max 30 seconds, then shows "analysis unavailable").
6. Analysis job writes results to `opportunities.analysis`, updates `ai_analyzed_at` and `analysis_version`.

**There is no separate "run analysis" endpoint.** The detail endpoint IS the trigger. This is R2 by design.

### 5.3 Cache invalidation rules

| Condition | Action |
|---|---|
| `opportunities.updated_at` > `opportunities.ai_analyzed_at` | Analysis is stale — re-run on next detail open |
| `analysis_version` != current model version constant | Analysis was generated by an older model — re-run |
| Opportunity `status` changes to `closed` or `awarded` | No analysis needed — skip |
| Manual data edit (PATCH to opportunity) | Bumps `updated_at`, which triggers re-analysis on next open |

### 5.4 API contract impact

Every detail endpoint returns the analysis inline. There is no "pending" state visible to the user for more than the initial load:

```json
{
  "id": 42,
  "title": "...",
  "analysis": {
    "pwin": { "score": 65, "factors": [...], "source": {...} },
    "incumbent": { "name": "SAIC", "confidence": "high", "source": {...} },
    "competitors": [...],
    "wargame": {...},
    "timeline": {...}
  },
  "analysis_status": "complete",
  "ai_analyzed_at": "2026-05-29T14:35:00Z"
}
```

If analysis is running: `"analysis": null, "analysis_status": "running"`.

**Why this choice:** Phase 0 Section 7.2 found the legacy path through n8n webhooks (`gda-opportunity-detail`) triggered analysis, but the Sprint 2 path (`GET /api/opportunities-v2/:id`) did not. V3 eliminates this split by making the detail endpoint itself the trigger. The JSONB column avoids the JOIN penalty of a separate analyses table and keeps the cache colocated with the data it describes. The `analysis_version` field enables seamless model upgrades — when the analysis model changes, all cached results automatically become stale.

---

## 6. n8n integration model

### 6.1 Core rule: n8n writes to V3 only via HTTPS webhooks

n8n will have **no direct database credentials** for `gda-postgres-v3`. The `N8N_DATABASE_URL` credential that legacy n8n uses to write directly to GDA's database will not be configured for V3. All n8n data flows go through authenticated HTTPS endpoints.

This is the single most important architectural change in V3. It eliminates:
- The 63 `gda_*` shadow tables (n8n no longer creates its own tables)
- The three competing opportunity stores (n8n writes to the same `opportunities` table via API)
- The schema drift risk (n8n cannot ALTER or CREATE anything in V3's database)

### 6.2 Inbound webhook endpoints V3 must expose

These endpoints replace the direct `INSERT`s n8n currently performs against shadow tables and the legacy schema:

| V3 endpoint | Auth | Replaces | Purpose |
|---|---|---|---|
| `POST /api/v3/ingest/opportunities` | `x-gda-key` | Direct INSERT to `gda_opportunity_tracker` + `sam_opportunities` | Upsert opportunities from SAM.gov, GovTribe, GovWin. Dedup on `sam_notice_id`. Auto-creates `sources` row. |
| `POST /api/v3/ingest/fpds-awards` | `x-gda-key` | Direct INSERT to `fpds_awards` | Ingest FPDS award data. Creates source row with `kind: 'fpds'`. |
| `POST /api/v3/ingest/intel` | `x-gda-key` | Direct INSERT to `gda_intelligence_log` + `intel_items` | Ingest intel items (news, competitor movements, market signals). |
| `POST /api/v3/ingest/action-items` | `x-gda-key` | Direct INSERT to `gda_action_items` | Create action items from email parsing or workflow triggers. |
| `POST /api/v3/ingest/launchpad-flags` | `x-gda-key` | Direct INSERT to `launchpad_flags` (if it existed in prod) | Create launchpad flags (cert expiry alerts, deadline warnings, etc.). |
| `POST /api/v3/ingest/competitor-movements` | `x-gda-key` | Direct INSERT to `gda_competitor_cache` + `competitor_movements` | Ingest competitor intelligence. |
| `POST /api/v3/ingest/partners` | `x-gda-key` | Direct INSERT to `gda_teaming_partners` | Update partner lookup data (certs, vehicles, contact info). |
| `POST /api/v3/webhooks/analysis-complete` | `x-gda-key` | n/a (new) | Callback for async analysis jobs — writes results to `opportunities.analysis`. |
| `POST /api/v3/webhooks/morning-briefing` | `x-gda-key` | Direct INSERT to `gda_morning_briefings` + `gda_daily_briefings` | Morning briefing results from the Morning Commander workflow. |

### 6.3 n8n reads from V3

n8n reads from V3 using the same HTTPS API the frontend uses:

| Read endpoint | Purpose |
|---|---|
| `GET /api/v3/opportunities` | List opportunities for workflow processing |
| `GET /api/v3/opportunities/:id` | Get opportunity detail (triggers R2 analysis) |
| `GET /api/v3/pipeline` | List pipeline items for reporting workflows |
| `GET /api/v3/action-items` | List action items for daily digest workflows |
| `GET /api/v3/partners/:id` | Get partner data for teaming worksheets |

All read endpoints require the `x-gda-key` header (same auth as ingest).

### 6.4 Migration path: which existing n8n workflows need rewiring

| Current n8n behavior | V3 target | Migration effort |
|---|---|---|
| **11 live webhooks** called by GDA backend (gda-opp-tracker, gda-pipeline, etc.) | These stay as-is — GDA backend calls n8n for data enrichment. n8n returns results via HTTP response. | Low — no change needed. |
| **Direct DB INSERT to `gda_opportunity_tracker`** (1,924 rows) | Rewire to `POST /api/v3/ingest/opportunities`. n8n sends JSON payload; V3 handles dedup and source tracking. | Medium — requires updating ~5 n8n workflows. |
| **Direct DB INSERT to `sam_opportunities`** (20,062 rows) | Rewire to `POST /api/v3/ingest/opportunities`. Same endpoint; `data_source` field distinguishes origin. | Medium — requires updating SAM sync workflows. |
| **Direct DB INSERT to 63 `gda_*` shadow tables** | Most are replaced by the V3 ingest endpoints above. Shadow tables that store ephemeral cache data (e.g., `gda_mega_cache`, `gda_dashboard_intel_cache`) can use n8n's own internal storage or Redis. | High — requires auditing all 158 active n8n workflows. Phase 3 task. |
| **Direct DB SELECT from GDA tables** (for reporting) | Rewire to V3 read API endpoints. | Medium — requires updating read workflows. |
| **`N8N_DATABASE_URL` credential** | **Revoked** for V3 database. n8n retains credentials only for its own internal DB. | Low — config change. |

**Why this choice:** Phase 0 Section 5.2 documented n8n's direct DB access pattern: "n8n has its own `N8N_DATABASE_URL` credential configured. Workflows can execute arbitrary SQL against the GDA database." This created 63 shadow tables, three opportunity stores, and made schema changes unpredictable. Revoking direct DB access and requiring all writes through authenticated webhooks is the only way to guarantee V3 schema integrity.

---

## 7. Non-functional requirements (NFRs)

### 7.1 Performance budgets

| Endpoint class | p50 target | p99 target | Notes |
|---|---|---|---|
| List endpoints (`GET /api/v3/opportunities`, etc.) | < 100ms | < 500ms | Paginated (default 50 items). Partial indexes on `deleted_at IS NULL` keep scans fast. |
| Detail endpoints (`GET /api/v3/opportunities/:id`) | < 50ms (cached analysis) | < 200ms (cached) | If analysis is stale, returns immediately with `analysis_status: "running"` and triggers background job. |
| Analysis background job | < 10s | < 30s | Async — does not block the detail response. |
| Ingest endpoints (`POST /api/v3/ingest/*`) | < 200ms | < 1s | Bulk upserts (up to 100 items per request). Source dedup included. |
| Audit log write | < 5ms | < 20ms | Append-only, no read contention. |

### 7.2 Uptime target

**99.5% monthly uptime** (allows ~3.6 hours of downtime per month). This accounts for:
- Planned maintenance windows (migration deploys, Postgres restarts)
- Hostinger VPS-level outages (single-server deployment)

V3 does not target high availability (no read replicas, no multi-AZ). The user base is one operator (Shawn).

### 7.3 Backup cadence

| Backup type | Frequency | Retention | Method |
|---|---|---|---|
| Full `pg_dump` | Daily at 02:00 UTC | 30 days | Cron job on VPS → compressed dump → off-VPS storage |
| WAL archiving | Continuous | 7 days | `archive_mode = on` for point-in-time recovery |
| Pre-migration snapshot | Before every migration | Until next migration succeeds | `pg_dump` triggered by migration runner before `BEGIN` |

### 7.4 Data retention

| Data class | Retention | Rationale |
|---|---|---|
| Opportunities (active) | Indefinite | Business records |
| Opportunities (soft-deleted) | 1 year after `deleted_at` | Recoverable for audit, then hard-delete |
| Audit log | 2 years | GovCon compliance requirement |
| Analysis cache | Until stale (see Section 5.3) | Ephemeral — regenerated on demand |
| Launchpad flags (dismissed) | 90 days | Context for "what did we dismiss and when" |
| Action item drafts (rejected) | 90 days | AI output audit trail |

### 7.5 Security model

| Layer | Mechanism |
|---|---|
| **Transport** | TLS everywhere. Traefik terminates TLS with Let's Encrypt certs. No plaintext HTTP. |
| **Authentication** | JWT tokens (short-lived, 1 hour) + refresh tokens (7 days). `JWT_SECRET` in env var, never in code. |
| **n8n auth** | `x-gda-key` header on all ingest/webhook endpoints. Key stored in `GDA_WEBHOOK_KEY` env var. |
| **DB auth** | Dedicated `gda_v3_app` Postgres role with DML-only permissions (SELECT, INSERT, UPDATE, DELETE). No DDL. Migration runner uses a separate `gda_v3_admin` role with full DDL. |
| **Secrets** | All secrets in env vars. No `.env` files committed. No secrets in Docker images. `.env.example` documents required vars without values. |
| **Env var hygiene** | Startup validator checks all required env vars are present and non-empty before the server starts. Missing vars = immediate exit with clear error message. No silent fallbacks to defaults for security-sensitive vars. |
| **CORS** | Restricted to the GDA domain (`gda.csr-llc.tech`). No wildcard origins. |
| **Rate limiting** | Traefik-level rate limiting: 100 req/s per IP for API endpoints. Ingest endpoints: 10 req/s (n8n IP allowlisted). |

### 7.6 Observability

| Signal | Tool | Detail |
|---|---|---|
| **Structured logging** | `pino` (JSON) | Every request logged with `request_id`, `user_id`, `method`, `path`, `status`, `duration_ms`. Sensitive fields redacted. |
| **Health endpoint** | `GET /api/v3/health` | Returns DB connectivity, migration version, uptime, memory usage. Called by Traefik health check (10s interval). |
| **Metrics** | Sentinel (existing) | System health snapshots table (`system_health_snapshots`) continues in V3. Sentinel probes V3 health endpoint + DB connectivity. |
| **Alerts** | Launchpad flags | System alerts surface as launchpad flags with `flag_type: 'system_alert'`. No external alerting service needed for single-operator deployment. |
| **Migration audit** | `schema_versions` table | Every migration recorded with SHA-256 hash, applier, commit SHA, and execution time. |

**Why this choice:** The NFRs are sized for the actual deployment: single-operator, single-VPS, GovCon tool. Over-engineering for horizontal scale would waste Phase 2 time. The performance budgets reflect the 95 MB database size and single-digit concurrent users. The security model addresses the Phase 0 finding of `.env.bak.*` files on the VPS (env var hygiene) and the `gda_runtime` role concept from migration 123 (DB role separation).

---

## 8. What's NOT in V3 (explicit exclusions)

| Excluded concept | Why excluded | Phase 0 reference |
|---|---|---|
| `ou_tag` enum and all multi-OU concepts | Envision-only tool. Scope correction binding. | `phase-0-scope-correction.md`: "every record is Envision by definition" |
| `ou_registry` table | No OU management needed | Scope correction: "`ou_registry` table — REMOVED ENTIRELY" |
| Partner browsing pages | Partners are lookup-only, not browsable | Scope correction: "Partner Intel page — REMOVED ENTIRELY from navigation" |
| `partner_awards` table | Not in Envision's workflow | Scope correction: "`partner_awards` table — REMOVED" |
| `partner_news_items` table | Not in Envision's workflow | Scope correction: "`partner_news_items` table — REMOVED" |
| `gda_rollup` reporting | No cross-OU rollup needed | Scope correction: "No `gda_rollup` cross-OU dashboard" |
| HR / candidate tracking | Not part of GDA Command scope | Not present in any canonical doc |
| All 63 `gda_*` n8n shadow tables | n8n writes via webhooks now; shadow tables have no purpose in V3 | Phase 0 Section 3.2: "63 shadow tables that exist in the DB but have no backend route code reference" |
| `opportunities_legacy` table | Data migrates to V3 `opportunities`; legacy table not carried forward | Phase 0 Section 6.1: "Unused legacy tables" |
| `record_version` trigger system | Replaced by simpler `audit_log` | Phase 0: 26 MB / 16,425 rows of versioning overhead; duplicate trigger bug in migration 043 |
| `_migrations` table | Replaced by `schema_versions` | Phase 0 addendum: dual tracker root cause |
| `schema_migrations` table | Replaced by `schema_versions` | Phase 0 addendum: dual tracker root cause |
| Pinecone integration | pgvector migration was in progress (migration 125); V3 completes the migration to pgvector-only | Phase 0 Section 9, question 5 |
| `bid_assessments`, `pipeline_forecasts`, `pwin_models`, `win_loss_analyses` | Unreferenced by any route code; no active functionality | Phase 0 Section 6.1: "Unused legacy tables" |
| `knowledge_chat_sessions` | Unreferenced legacy table | Phase 0 Section 6.1 |

---

## 9. Open questions for Phase 1 review

| # | Question | Options | Recommended | Rationale |
|---|---|---|---|---|
| 1 | **Legacy opportunity data import strategy** — Three tables (`sam_opportunities` 20,062 rows, `gda_opportunity_tracker` 1,924 rows, `opportunities` 658 rows). Which rows migrate to V3? | (a) All rows from all three tables, deduped on `sam_notice_id` (b) Only `opportunities` (658) + `sam_opportunities` where Envision is pursuing (c) Only `opportunities` (658) | (b) | `sam_opportunities` is the authoritative SAM.gov feed; `opportunities` has Envision's qualified pursuits. `gda_opportunity_tracker` is n8n shadow data — triage required to separate Envision rows from partner/noise rows. |
| 2 | **pgvector in V3** — Keep pgvector extension for document embeddings, or defer to a separate knowledge service? | (a) Keep pgvector in `gda-postgres-v3` (b) Defer vector search to a separate service | (a) | pgvector is already in use (migration 004, 125). Document embeddings (901 rows, 15 MB) are manageable. No need for a separate vector DB at this scale. |
| 3 | **n8n workflow audit scope** — 158 active workflows exist. How many need to be audited and rewired for V3 webhook-only access? | (a) Audit all 158 before Phase 2 starts (b) Audit only the 11 live + 20 "exists" webhooks; defer the rest (c) Defer all n8n rewiring to Phase 3 | (c) | n8n rewiring is Phase 3 scope. Phase 2 builds the V3 API. Phase 3 rewires n8n to call it. Full audit of 158 workflows is a Phase 3 deliverable. |
| 4 | **Analysis background job mechanism** — What runs the async analysis when a detail endpoint triggers it? | (a) In-process async (fire-and-forget promise in Express) (b) Postgres-backed job queue (pg-boss, graphile-worker) (c) n8n workflow triggered via webhook | (a) for Phase 2, with option to upgrade to (b) if scale requires it | Single-operator deployment. In-process async is simplest. If analysis jobs start queueing (>10 concurrent), upgrade to pg-boss. |
| 5 | **Data retention enforcement** — Automated hard-delete of expired soft-deleted records? | (a) Cron job that hard-deletes past retention (b) Manual periodic cleanup (c) Keep all data indefinitely | (b) for now | 95 MB database — storage is not a concern. Manual cleanup during quarterly maintenance windows is sufficient. |
| 6 | **Financial Bible tables** — Legacy has `financial_kpis` + `monthly_financials`. Carry forward to V3 as-is? | (a) Carry forward with R1 source columns added (b) Redesign financial schema (c) Defer financials to a later phase | (a) | Financial tables are small, functional in prod, and outside the Phase 0 "broken" scope. Add `source_id` FK and carry forward. Detailed in F-202 API contract. |
| 7 | **Traefik routing mechanism** — How does the `GDA_BACKEND_VERSION` env var control routing? | (a) Traefik labels on Docker containers (dynamic) (b) Traefik file provider with env var interpolation (c) DNS-level switch | (a) | Docker labels are the standard Traefik pattern. During cutover, the V3 container gets the active routing labels; legacy container keeps health-check-only labels for rollback. |

---

## Design decision summary

| # | Decision | Phase 0 finding addressed |
|---|---|---|
| 1 | n8n writes only via HTTPS webhooks — no direct DB access | 63 shadow tables created by n8n direct DB access |
| 2 | Single `schema_versions` tracker (new name, not reusing legacy names) | Dual `schema_migrations` + `_migrations` tracker caused 6 migrations to not apply to prod |
| 3 | `BIGSERIAL` PKs on all tables | Legacy `opportunities.id` was `text`, causing FK type mismatches |
| 4 | Single `opportunities` table (no `_legacy`, no shadow duplicates) | Three competing opportunity tables in prod |
| 5 | `source_id NOT NULL FK` on every fact table (R1 DB-enforced) | R1 was API-layer only; tables had inconsistent source columns |
| 6 | Analysis in `opportunities.analysis` JSONB with version-based cache invalidation (R2) | Sprint 2 detail endpoint had no auto-analysis; legacy path through n8n did |
| 7 | No `ou_tag`, no `ou_registry`, no partner browsing | Scope correction: Envision-only tool |
| 8 | Pre-flight `EXPLAIN` check before every migration | Migrations 127–130 assumed schema state that didn't match prod |
| 9 | CHECK constraints instead of custom enum types | 7 enums defined in migrations 127–130 never landed in prod |
| 10 | `audit_log` replaces `record_version` trigger system | `record_version` was 26 MB (16,425 rows) with duplicate trigger bugs |
| 11 | Side-by-side container topology with Traefik routing for cutover | Need instant rollback capability during 30-day soak |
| 12 | `partners` as 2-row lookup table with JSONB certs/vehicles | Partner data is lookup-only; no need for normalized partner sub-tables |


## Addendum A — No-Degradation Mandate (R2 Hardening)

**Date:** 2026-05-29
**Binding rule:** The user has explicitly stated: "I do not want a degraded tool. I laid out what I want, now let's get there."

This addendum amends Section 5 (Auto-analysis model) to eliminate every code path that could expose the user to placeholder, pending, stale, or "unavailable" analysis state.

---

### A.1 R2 invariant (binding, non-negotiable)

> **When the user opens an opportunity detail page, the analysis block in the response is always populated with fresh data. No placeholder. No `null`. No "running" status. No "stale: true" flag. No polling. No 30-second timeout fallback.**

This replaces Section 5.2 steps 4-5 and Section 5.4 verbatim. The "analysis_status" field is removed from the API contract. The frontend polling loop is removed.

---

### A.2 Pre-warm policy

Analysis runs proactively at every event that could change the analysis result. The detail endpoint is **never** the first place analysis runs.

| Event | Action |
|---|---|
| n8n webhook upserts an opportunity (`POST /api/v3/webhooks/sam-opportunity` and any future opp-creating webhooks) | Enqueue analysis job for the upserted opportunity immediately upon transaction commit. |
| Manual opportunity create (`POST /api/v3/opportunities`) | Enqueue analysis job immediately upon transaction commit. Return 201 with the opportunity record; analysis job runs async. |
| Opportunity update (`PATCH /api/v3/opportunities/:id`) | If any field in the analysis-affecting set changed (`title`, `agency`, `sub_agency`, `solicitation_number`, `sam_notice_id`, `naics`, `psc`, `set_aside`, `value_min`, `value_max`, `incumbent`, `description`, `tags`, `response_due_at`), enqueue re-analysis on commit. |
| Source data changes (`opportunities.source_id` changes) | Enqueue re-analysis on commit. |
| Analysis model version bump (config constant changes) | Background job sweeps all opportunities where `analysis_version != current_version` and re-analyzes them, oldest first. Job runs at server boot and on a 6-hour cron. |
| Periodic refresh | Background job sweeps all opportunities where `ai_analyzed_at < NOW() - INTERVAL '24 hours'` and re-analyzes them. Job runs every 6 hours. |

**Net effect:** by the time a user opens a detail page, the analysis JSONB is already populated and fresh in 99%+ of cases.

---

### A.3 Detail endpoint behavior (synchronous block — no polling)

Replaces Section 5.2:

```
GET /api/v3/opportunities/:id

Algorithm:
1. SELECT opportunity row including analysis, analysis_version, ai_analyzed_at, updated_at.
2. Determine freshness:
   - cache_fresh = (analysis IS NOT NULL)
                   AND (analysis_version = CURRENT_ANALYSIS_VERSION)
                   AND (ai_analyzed_at >= updated_at)
3. IF cache_fresh:
     Return opportunity with analysis populated. Target p50 < 50ms.
4. IF NOT cache_fresh:
     a. Check pg-boss for an existing analysis job for this opportunity_id with state 'created' or 'active'.
     b. IF a job is in flight:
          Wait up to 10 seconds for job completion (poll job state with 100ms backoff).
        ELSE:
          Enqueue a new analysis job with priority=HIGH and wait up to 10 seconds for completion.
     c. On completion: re-read the opportunity row, return with populated analysis.
     d. IF the 10-second wait elapses without completion:
          Return HTTP 503 with error code 'ANALYSIS_TIMEOUT'.
          Do NOT return the opportunity with null analysis.
          Do NOT return the opportunity with stale analysis.
          The frontend treats 503 as a retryable error and re-issues the request after 2 seconds.
```

**Why 503 instead of degraded response:** A 503 is a clear signal that the system is not ready to serve this view. The frontend retries (with backoff) until success. The user never sees a half-populated detail page. This matches the user's mandate: no degraded tool.

**Backstop:** Pre-warm policy (A.2) ensures cache misses are vanishingly rare. The 503 path exists only for the cold-start moment after a deploy or for opportunities that have never been opened before the analyzer caught up.

---

### A.4 Job queue: pg-boss from day one

Replaces Section 9 Question 4 default ("in-process async"). The binding decision is:

- **Job runner:** `pg-boss` (Postgres-backed job queue).
- **Rationale:** In-process fire-and-forget loses jobs on container restart, has no retry, no priority, no observability. pg-boss has all four. Single-operator scale is irrelevant — the cost of pg-boss is negligible and the correctness gain is large.
- **Queues:**
  - `analysis-opportunity` (priority HIGH for detail-endpoint-triggered jobs, NORMAL for pre-warm)
  - `analysis-capture` (same model for capture detail endpoints)
  - `ingest-postprocess` (for webhook side-effects beyond the initial upsert)
- **Concurrency:** Single worker per queue initially. Configurable per queue. Workers run in the same `gda-backend-v3` container — no separate worker container needed at single-operator scale.
- **Observability:** pg-boss exposes job state in Postgres tables (`pgboss.job`). Admin endpoint `GET /api/v3/admin/jobs` surfaces queue depth and active jobs for the operator.

---

### A.5 Removed concepts (do not implement)

The following are explicitly forbidden in the V3 implementation:

- `analysis_status` field in any API response.
- `"running"` / `"pending"` / `"not_yet_analyzed"` values anywhere in the API surface.
- `stale: true` flag in analysis responses.
- Frontend polling for analysis completion.
- 30-second client-side "analysis unavailable" fallback view.
- Returning `analysis: null` from the detail endpoint under any condition.

---

### A.6 Test coverage (F-204 amendment trigger)

The F-204 test strategy gates the following CI checks against the rules in this addendum. These are added on top of the existing F-204 R2 gates:

1. **R2 freshness gate:** For every detail endpoint, CI creates a record, calls the detail endpoint, and asserts `analysis` is populated within the 10-second SLA. No `analysis: null`. No `analysis_status: "running"`. No `stale: true`.
2. **R2 pre-warm gate:** CI inserts an opportunity via the ingest webhook, polls pg-boss until the analysis job completes, then calls the detail endpoint and asserts `analysis` is populated with `ai_analyzed_at >= opportunity.created_at`.
3. **R2 update gate:** CI updates an analysis-affecting field via PATCH, polls pg-boss until the re-analysis job completes, asserts `ai_analyzed_at >= updated_at`.
4. **R2 503 contract gate:** CI artificially stalls a job to exceed the 10-second SLA, asserts the detail endpoint returns HTTP 503 with `ANALYSIS_TIMEOUT` code (never a degraded 200 response).

**Implemented in:** `docs/architecture/v3/phase-1-test-strategy.md` Addendum B (F-204a) — Gates 1–4. Forbidden token CI workflow: `.github/workflows/v3-forbidden-tokens.yml`.

---

### A.7 Backwards compatibility

This addendum supersedes any conflicting language in Section 5 and Section 9 Question 4 of the parent document. Where the parent document and this addendum conflict, the addendum governs.
