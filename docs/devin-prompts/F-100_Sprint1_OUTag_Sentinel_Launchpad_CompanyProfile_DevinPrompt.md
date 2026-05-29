# F-100 — GDA Command v2 Rebuild · Sprint 1 (Foundation + Launchpad + Company Profile)

**Repo:** shawnseffernick175/gda-command-v2
**Branch:** `feature/F-100-sprint1-foundation`
**Type:** Schema migration + backend modules + 2 frontend pages + 1 n8n workflow
**Doctrine anchors:** Alignment · Data First · Ethics · Teamwork (foundation for all later doors)

## Why

GDA Command tool is being rebuilt under the corrected ownership model: **the tool is Envision's workspace.** Riverstone and PD Systems are tracked as teaming partners through a Partner Intel door (later sprint), not as co-equal tenants. The doctrine is GDA enterprise-level but enforced through Envision's daily operations.

Sprint 1 lays the foundation that every later door depends on:
1. An **OU tag** baked into every record so federation later is a permissions change, not a rebuild.
2. A **Sentinel skeleton** every later door reports to from birth.
3. The **Launchpad** — Shawn's first screen each morning, with the 3 Day-1 critical flags.
4. The **Company Profile** — Envision identity as primary truth, GDA 3-pillar narrative as the proposal sub-view.

After Sprint 1, doors 1-12 (Opportunities through Agentic AI) get built in subsequent sprints against this foundation.

---

## What to build

### 1. New table — `ou_tagged_records` registry pattern

This sprint does **not** create the 12 door tables (those come in later sprints). What it does is establish the **canonical OU tag enum + helper** that every future table will use.

Migration (next sequential number in `packages/backend/src/db/migrations/`):

```sql
-- Enum for OU tagging
DO $$ BEGIN
  CREATE TYPE ou_tag AS ENUM ('envision', 'riverstone', 'pd_systems', 'teaming', 'gda_rollup');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Reference table any door can join against for OU metadata
CREATE TABLE IF NOT EXISTS ou_registry (
  ou_tag        ou_tag PRIMARY KEY,
  display_name  TEXT NOT NULL,
  anchor_company TEXT NOT NULL,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  is_partner    BOOLEAN NOT NULL DEFAULT FALSE,
  uei           TEXT,
  cage          TEXT,
  primary_naics TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ou_registry (ou_tag, display_name, anchor_company, is_primary, is_partner, uei, cage, primary_naics, notes) VALUES
  ('envision',   'OU-I Defense & Mission Systems',          'Envision Innovative Solutions', TRUE,  FALSE, 'VNMLXFMQD976', '4JB87',  '541715', 'Primary tool user. Shawn operates this OU.'),
  ('riverstone', 'OU-II Intelligence & Cyber Engineering',  'Riverstone Solutions',          FALSE, TRUE,  NULL,           '71WX3',  NULL,     'Partner Intel. Tracked via Partner Intel door, not operated.'),
  ('pd_systems', 'OU-III Training, Simulation & Digital Readiness', 'PD Systems',           FALSE, TRUE,  'MBF6MBLZLMC3', '4V8V7',  '561210', 'Partner Intel. Tracked via Partner Intel door, not operated.'),
  ('teaming',    'Joint Pursuit (multi-OU)',                'GDA',                            FALSE, FALSE, NULL,           NULL,     NULL,     'Applied to opportunities/pipeline/capture when Envision is teaming with one or more partners on the same pursuit.'),
  ('gda_rollup', 'GDA Enterprise Rollup',                   'Georgetown Defense Analytics',   FALSE, FALSE, NULL,           NULL,     NULL,     'Applied to records that represent the GDA parent narrative (3-pillar story used in proposals upmarket).')
ON CONFLICT (ou_tag) DO NOTHING;
```

### 2. New module — `packages/backend/src/lib/ou-tag.ts`

Single source of truth for OU validation + helpers. Every future door imports from here.

Exports:
- `type OuTag = 'envision' | 'riverstone' | 'pd_systems' | 'teaming' | 'gda_rollup'`
- `const OU_TAGS: OuTag[]` (frozen array for UI dropdowns)
- `function isValidOuTag(value: unknown): value is OuTag`
- `function defaultOuTag(): OuTag` → returns `'envision'`
- `async function getOuRegistry(pool: Pool): Promise<OuRegistryRow[]>` (cached 5 min)
- `function requireOuTagColumn(tableName: string): string` → returns SQL fragment `ou_tag ou_tag NOT NULL DEFAULT 'envision'` for future migrations to embed

### 3. Sentinel skeleton — extend F-039 if it exists, otherwise create

**If `packages/backend/src/lib/health-sentinel.ts` from F-039 already exists**, add three new probes; do not modify existing probes:
- `ou_registry_seed` — pass if `SELECT COUNT(*) FROM ou_registry` returns 5
- `migrations_current` — pass if migrations table head matches expected latest
- `launchpad_flags_fresh` — pass if `launchpad_flags` table (created in step 4) has been read in last 24h (a Launchpad-served flag set is the canary that the daily-driver page is alive)

**If F-039 was never shipped** (file does not exist), scope is too large for this sprint — comment in PR and stop. Sentinel skeleton presence is a hard prerequisite. Do not invent a parallel sentinel.

### 4. New table — `launchpad_flags`

Migration:

```sql
CREATE TABLE launchpad_flags (
  id              BIGSERIAL PRIMARY KEY,
  ou_tag          ou_tag NOT NULL DEFAULT 'envision',
  flag_key        TEXT NOT NULL UNIQUE,
  severity        TEXT NOT NULL CHECK (severity IN ('critical','warning','info')),
  title           TEXT NOT NULL,
  detail          TEXT NOT NULL,
  due_date        DATE,
  doctrine_anchor TEXT,             -- e.g. 'Ethics Always', 'Market/Mission/Brand Focus'
  source_url      TEXT,
  is_dismissed    BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_launchpad_flags_severity ON launchpad_flags(severity, is_dismissed);
CREATE INDEX idx_launchpad_flags_due_date ON launchpad_flags(due_date) WHERE is_dismissed = FALSE;

-- Seed the 3 Day-1 critical flags
INSERT INTO launchpad_flags (ou_tag, flag_key, severity, title, detail, due_date, doctrine_anchor, source_url) VALUES
  ('envision', 'cio_sp3_expired',
   'critical',
   'CIO-SP3 SB/8(a) EXPIRED',
   'Envision''s CIO-SP3 Small Business / 8(a) status via Dynamic Vision LLC expired 4/29/2026. Cannot bid CIO-SP3 set-aside task orders until restored.',
   '2026-04-29',
   'Ethics Always',
   NULL),
  ('envision', 'cmmi_ml3_expiring',
   'critical',
   'CMMI-DEV ML3 expires 8/7/2026',
   'Envision''s CMMI-DEV Maturity Level 3 appraisal expires 8/7/2026 (~10 weeks). Recertification appraisal must be scheduled now to avoid lapse.',
   '2026-08-07',
   'Ethics Always',
   NULL),
  ('envision', 'mentor_protege_urgent',
   'critical',
   'Mentor-Protégé Agreement — most urgent action',
   'Per FY26 Business Plan, Mentor-Protégé Agreement is the most urgent action to preserve small-business prime eligibility as Envision''s 5-year average revenue ($54.1M) exceeds NAICS 541715 $34M threshold. No status captured.',
   NULL,
   'Market, Mission, Brand Focus',
   NULL)
ON CONFLICT (flag_key) DO NOTHING;
```

### 5. New routes — `packages/backend/src/routes/launchpad.ts`

- `GET /api/launchpad/flags?ou_tag=envision` — returns active (non-dismissed) flags ordered by severity then due_date. Default `ou_tag=envision`.
- `POST /api/launchpad/flags/:id/dismiss` — auth-protected (`x-gda-key`). Sets `is_dismissed=true`, `dismissed_at=NOW()`.
- `GET /api/launchpad/daily-intel?date=2026-05-28` — returns news items from existing news ingestion (`news@gda.csr-llc.tech` → existing `news_items` table if present; if not present, return empty array and log a TODO). Default date = today EST.

Wire into `server.ts` like other routes.

### 6. New routes — `packages/backend/src/routes/company-profile.ts`

- `GET /api/company-profile/envision` — returns Envision identity card (UEI, CAGE, NAICS, certs with expiration, top vehicles, primary customers). Source the static data from a new file `packages/backend/src/data/envision-profile.json` (Devin: extract from `docs/canonical/gda_company_profile_v1.md` §4 OU-I).
- `GET /api/company-profile/gda-narrative` — returns the 3-pillar Enable/Protect/Train narrative for proposal generation. Source from new file `packages/backend/src/data/gda-narrative.json` (Devin: extract from `docs/canonical/gda_company_profile_v1.md` §1, §4, §5, §7).
- `GET /api/company-profile/partners` — returns Riverstone + PD Systems summary cards (name, anchor, certs, top vehicles, "why Envision tracks them"). Read-only.

### 7. Frontend — Launchpad page

Add `packages/frontend/src/pages/Launchpad.tsx`:

Top to bottom:
1. **Header** — "Launchpad — [today's date in EST]" + Envision logo/wordmark placeholder
2. **Critical Flags strip** — fetched from `/api/launchpad/flags`. Render each as a card: severity dot (red/yellow/blue), title, detail (truncate 200 chars w/ expand), doctrine anchor as small italic-styled tag, due date if present, dismiss button (calls `/dismiss` then refetches)
3. **System Status** — embed the F-039 `SystemStatusStrip` component if it exists
4. **Daily Intel** — list news items from `/api/launchpad/daily-intel`. If empty, show "No items ingested yet for [date]. Auto-ingestion via news@gda.csr-llc.tech is active."
5. **Footer** — "Doctrine: 'The standard you walk past is the standard you accept.'"

Make Launchpad the default route. Update the app router so `/` → Launchpad.

### 8. Frontend — Company Profile page

Add `packages/frontend/src/pages/CompanyProfile.tsx`:

Tabbed layout, three tabs:
1. **Envision (primary, default tab)** — renders `/api/company-profile/envision`. Identity card + Certs section (with expiration warnings if <90d) + Vehicles + Customers + Financial cadence note
2. **GDA Narrative (proposal sub-view)** — renders `/api/company-profile/gda-narrative`. 3-pillar Enable/Protect/Train story, FY26-FY28 rollup numbers, "Boring Excellence" positioning paragraph. Label this tab clearly: "Use for upmarket proposal positioning."
3. **Partners (read-only)** — renders `/api/company-profile/partners`. Two cards (Riverstone, PD Systems), with "Tracked, not operated" note at top. Future Partner Intel door (Sprint X) will replace this with full intel.

### 9. n8n cron — `GDA.launchpad.daily-refresh`

Add JSON to `docs/n8n-launchpad-daily-refresh.json` (do not import to live n8n — Shawn will). Schedule: 6:00 AM EST daily. Three HTTP nodes in sequence:
1. `POST {{$env.GDA_BASE_URL}}/api/sentinel/run` (kicks Sentinel)
2. `GET {{$env.GDA_BASE_URL}}/api/launchpad/flags` (warms cache, surfaces any new flags into n8n run log)
3. `GET {{$env.GDA_BASE_URL}}/api/launchpad/daily-intel` (warms cache)

All nodes use `x-gda-key` header from existing credential `GDA Webhook Auth v2` (id `F4J3vYsPrJrYiO49`).

### 10. Tests

`packages/backend/src/__tests__/ou-tag.test.ts`:
- `isValidOuTag` returns true for each of the 5 tags, false for anything else
- `defaultOuTag` returns `'envision'`
- `getOuRegistry` returns 5 rows; primary count = 1; partner count = 2

`packages/backend/src/__tests__/launchpad.test.ts`:
- `GET /api/launchpad/flags` returns 3 seeded flags ordered critical-first
- Dismissed flags excluded by default
- `POST /:id/dismiss` flips the row and is reflected in next GET

`packages/backend/src/__tests__/company-profile.test.ts`:
- `/envision` returns Envision UEI `VNMLXFMQD976`
- `/gda-narrative` returns the 3-pillar story with all three pillars present
- `/partners` returns 2 partner records, both flagged read-only

Mock DB where appropriate. Do NOT hit live n8n or SAM.gov in tests.

---

## Constraints

- **Do not** create tables for any door other than Launchpad + ou_registry. Opportunities, Pipeline, Capture, Performance, Past Performance, Vehicles, Financial Bible, Action Items, Agentic AI, Partner Intel are OUT of scope for Sprint 1.
- **Do not** modify existing F-038 ingestion, F-039 Sentinel core probes, F-040 secret rotation, or any merged PR work (#353, #354, #356, #358, #359, #361).
- **Do not** rotate, regenerate, or touch any secrets.
- **Do not** import the n8n workflow JSON into live n8n — Shawn will.
- **Do not** delete or rename any existing module. New files only.
- **Default OU tag everywhere is `envision`.** Future doors inherit this default.
- All times stored as UTC; displayed as EST in frontend.
- Frontend pages use existing component library + Tailwind/ECharts (no new chart libs).
- **No cartoon charts** — ECharts only. (Doctrine: Data First.)

---

## Deliverable

- One PR: `feature/F-100-sprint1-foundation`
- 5/5 CI green
- Tests pass
- Migrations apply cleanly forward AND reverse on local
- Self-review your PR before requesting review
- Open as draft if anything is uncertain — comment in PR with the question
- Include screenshots of Launchpad and Company Profile (all three tabs) in the PR description

---

## Acceptance criteria (how Shawn judges done)

1. ✅ `ou_registry` seeded with 5 tags; `envision` is primary; `riverstone` + `pd_systems` are partners
2. ✅ `launchpad_flags` seeded with 3 critical flags, all `severity='critical'`, `ou_tag='envision'`
3. ✅ Loading `/` shows the Launchpad page with the 3 flags visible above the fold
4. ✅ Loading `/company-profile` shows Envision tab by default, with VNMLXFMQD976 visible
5. ✅ GDA Narrative tab shows all 3 pillars (Enable, Protect, Train) and is labeled for proposal use
6. ✅ Partners tab shows Riverstone + PD Systems with "Tracked, not operated" note
7. ✅ F-039 Sentinel reports 3 new probes (`ou_registry_seed`, `migrations_current`, `launchpad_flags_fresh`) all green
8. ✅ Tests in all three test files pass

---

## Out of scope (do NOT touch this sprint)

- Opportunities door
- Pipeline door
- Capture door (RFP shredder, color review)
- Performance / Past Performance / Vehicles & IDIQs
- Financial Bible (manual upload — Shawn handles)
- Action Items door
- Agentic AI door
- Partner Intel door (door 12 — its own sprint)
- Authentication / multi-user / role-based permissions (Envision-only operation, no other OUs log in)
- Email/SMS/push alerting from Launchpad (Phase 2)
- Editing partner data (read-only this sprint)
- Pinecone / vector cleanup (paused)
- Reader cutover (paused)

---

## Aesthetics & Organization Standard (non-negotiable)

The tool must look and feel premium. "Boring Excellence" applies to the UI, not just operations. Every screen in this sprint must meet ALL of these:

**Visual restraint**
- ONE accent color (Hydra Teal `#01696F` or a deep navy `#1B3A57` — pick one and use it across both pages). Everything else neutral grays/off-whites.
- Background `#F7F6F2` (warm off-white) or `#FAFAFA` (cool off-white). NOT pure white.
- Body text `#28251D` on light; `#CDCCCA` on dark surface. WCAG AA contrast minimum (4.5:1 body).
- NO gradients on shapes, buttons, or text.
- NO decorative icons. Status dots and severity indicators are the only iconography allowed.
- NO emoji in the rendered UI (the seed data may contain ⚠️ in `detail` text — render that as a styled severity badge, not the raw character).

**Typography**
- ONE font family for the whole app — Inter (preferred) or system sans-serif fallback. NO multiple display fonts.
- 3-4 text styles only: Display (28-36px), Section heading (18-20px semibold), Body (15-16px), Caption (12-13px muted).
- `tabular-nums` on every numeric value (UEI, CAGE, financials, dates).
- Left-aligned body text. Center only short titles and stat callouts.

**Spacing & layout**
- 8px spacing grid. Never use arbitrary pixel values — only multiples of 4 (preferred 8, 12, 16, 24, 32, 48, 64).
- Page container max-width 1280px, centered, 32px horizontal padding minimum.
- Cards: 24px internal padding, 16px gap between cards, 1px neutral border (`#D4D1CA`), no shadows or only the lightest shadow (`0 1px 2px rgba(0,0,0,0.04)`).
- Critical flag cards on the Launchpad use a 4px left-side severity-color accent bar — that is the ONLY exception to "no colored borders on cards."
- No element placed less than 24px from another element. No element less than 16px from a page edge.

**Hierarchy**
- Page title is the largest element on the page, top-left, with the doctrine quote as a muted caption directly below it.
- Critical flags above the fold on Launchpad. System Status strip directly below flags. Daily Intel below status.
- Company Profile tabs: pill-style tab strip, active tab uses the accent color underline (2px), inactive tabs are neutral text.

**Organization**
- Component file structure mirrors the page structure. `pages/Launchpad.tsx` composes `<LaunchpadHeader />`, `<CriticalFlagsList />`, `<SystemStatusStrip />` (existing F-039), `<DailyIntelList />`. One component per file. No 400-line page files.
- API routes return data already shaped for the UI. Frontend does not transform — it renders.
- All dates display in EST (e.g., `5/28/2026` or `May 28, 2026`). Never raw UTC.
- All dollar amounts formatted with commas + currency symbol (e.g., `$70.1M`, `$1,234,567`). Use `tabular-nums`.

**No** stock images, hero illustrations, decorative SVG patterns, animated GIFs, or anything that says "AI template demo." This is a $500M company's operating tool, not a SaaS landing page.

**NO DECORATIVE CHARTS.** Sprint 1 ships ZERO charts. The Launchpad and Company Profile pages do not need them. Do not add a chart "for visual variety," "to fill space," or because a section looks empty. A chart exists only when it answers a specific operational question with real data, and there is no such question in Sprint 1. If a later sprint needs a chart, it will be ECharts, it will display real data, and it will state the insight in its title (e.g., "Pipeline win-prob requires evidence — 12 of 18 pursuits lack it"), never decorate.

**If anything in the UI looks busy, decorative, or untidy — stop and simplify before opening the PR.** Self-review the screenshots in the PR description against this section.

---

## Canonical reference docs (read these before starting)

All committed to this repo under `docs/canonical/` — read in this order:

1. `docs/canonical/tool_ownership_model_v1.md` — why Envision is primary and partners are intel
2. `docs/canonical/gda_company_profile_v1.md` — ground truth for all profile data (extract Envision identity from §4 OU-I, GDA narrative from §1+§4+§5+§7)
3. `docs/canonical/doctrine_to_doors_map.md` — what each door must enforce
4. `docs/canonical/partner_intel_spec_v1.md` — what door 12 will do (informs Partners tab design)
