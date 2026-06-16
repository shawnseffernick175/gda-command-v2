# GDA Command v2 — Operational Status

**Last Updated:** 2026-06-16 (auto-generated, end of day)
**Production:** https://gda.csr-llc.tech
**Repository:** https://github.com/shawnseffernick175/gda-command-v2
**Latest commit on main:** `188d96c7` (Awards & Intel rebuild #881) followed by Action Items doctrine #880

---

## 1. PR Queue State

**Open PRs:** 0

**Merged today (2026-06-16):** 29 PRs

| # | Title |
|---|---|
| #826 | Sticky headers — top KPI strip bleed-through fix + wire ? tooltips |
| #828 | feat(llm): default to Sonnet + add prompt caching for stable system content |
| #830 | feat(auth): refresh token persistence + silent re-authentication |
| #833 | chore: remove unused Daily Brief page, route, and scheduled job |
| #834 | feat(digest): wire regulatory tracker links + filter upcoming solicitations |
| #838 | docs: FasTrac signal source research (60+ DoD innovation orgs + 55+ Army bases) |
| #839 | feat(ux): universal score explanation — wire ScoreExplain popover on every score |
| #840 | feat(fastrac): rename Fast Track → FasTrac + add Academia tab |
| #841 | feat(fastrac): bidirectional need ↔ solution matching + evidence panel |
| #848 | feat(fastrac): ingest Tier 1 Army installation and unit innovation signals |
| #851 | feat(fastrac): ingest Tier 1 innovation org signals (AFWERX, SOFWERX, DIU, AFC, DARPA) |
| #852 | feat(opportunities): GovWin + GovTribe fallback enrichment for Value and Due date |
| #853 | fix: remove nested vertical scroll containers — one scrollbar per page |
| #854 | feat: remove A/B/C/D/F letter grade system, add 🔥 Hot (Pwin ≥ 70%) KPI tile |
| #855 | feat: global click-to-sort table headers across all data tables |
| #856 | feat(opportunities): row actions kebab menu — stage, assign, tag, note, pass |
| #857 | fix: Pwin shows different values on list vs detail page — consolidate |
| #859 | feat(vehicles): ingest contract vehicles from Vault docs, populate Vehicles page |
| #862 | feat(vault): .msg parser + extraction_status + re-extract endpoint |
| #863 | [Devin] Ingest CEO Capture Table (12 pursuits) + $1=IDIQ rule |
| #867 | Contract Waterfall — Task Orders only, NOT IDIQs (Gantt view) |
| #875 | Pipeline scope — only CEO's pursuits, not SAM/GovTribe firehose noise |
| #877 | Approvals — remove from top nav, move to Settings → Data Quality |
| #879 | Sentinel Health — make it a static status indicator only (no link, no click) |
| #880 | fix(action-items): kill SAM firehose, replace with doctrine-approved sources |
| #881 | Awards & Intel rebuild — wheelhouse-scoped, AI analysis surfaced |
| #882 | Prompt Creator — strip dev clutter, fix save bug, move to top nav |
| #883 | Workshop — new tab for document teardown + targeted output generation |
| #886 | feat: IDIQ Operations — new tab for live TO monitoring across 16 vehicles |

**Outstanding:** PR #884 (Scoring & Doctrine Config page) was broken during manual conflict resolution. Devin has been asked to recover from his session workspace and re-push. Spec preserved in issue #878.

---

## 2. Doctrine (Binding Rules)

These rules are enforced in code, data, and UI. They came from CEO directly. They do not change.

1. **`$1 = IDIQ placeholder.** Any opportunity with value of exactly $1 is an IDIQ. NULL the dollar value, exclude from rollups, display the literal text "IDIQ". Never sum.
2. **IDIQs do NOT appear in Contract Waterfall.** Only Task Orders against IDIQs. The waterfall is a Gantt of executable revenue, not vehicle ceilings.
3. **Capture reviews are first-class.** The tool exists to run capture reviews on every active pursuit — all of them, every cycle.
4. **Nothing is in Pipeline except what the CEO put there.** SAM.gov/GovTribe firehose is not Pipeline — it's intake noise. Pipeline = approved pursuits only.
5. **Sentinel Health is a static status indicator.** No link, no click, no expand. It exists to confirm the platform is alive.
6. **Prompt Creator has no JSON exports, no sidebar metadata.** Operator never needs a JSON. Strip dev clutter.
7. **Score system.** No letter grades (A/B/C/D/F removed). Hot tile = Pwin ≥ 70%. Pwin must match between list and detail views.

---

## 3. Active Capability Map (post-2026-06-16 merges)

### Top-Nav Tabs (current)
- **Launchpad** — operator landing
- **Pipeline** — CEO-approved pursuits only (12 from Capture Table seed)
- **Ops Tracker** — full universe of opportunities
- **Contract Waterfall** — Task Orders Gantt (IDIQs excluded)
- **IDIQ Operations** *(new #886)* — live TO monitoring across 16 vehicles
- **Workshop** *(new #883)* — document teardown + targeted output generation
- **Awards & Intel** *(rebuilt #881)* — wheelhouse-scoped, AI analysis surfaced
- **Action Items** *(rebuilt #880)* — doctrine-approved sources, no SAM firehose
- **FasTrac** — DoD innovation org + Army base + Academia signal ingestion
- **Vehicles** — vehicle portfolio from Vault docs
- **Vault** — document store (.msg parser added #862)
- **Prompt Creator** — operator prompts only, no dev clutter
- **Settings → Data Quality** — Approvals queue moved here

### Sentinel Health
Static green status indicator. No interaction. Confirms platform is alive. No drill-down.

### Score System
- No letter grades anywhere.
- 🔥 Hot KPI tile = count of opportunities with Pwin ≥ 70%.
- Pwin is consistent between Pipeline list view and detail view.
- ScoreExplain popover wired on every score display.

### Data Sources (active)
- **SAM.gov** — opportunity ingest (filtered, not raw firehose)
- **GovTribe** — Pwin + due-date enrichment via fallback
- **GovWin** — Pwin + due-date enrichment via fallback
- **USAspending.gov** — Awards & Intel filtered to wheelhouse only
- **SEC EDGAR** — public-company filings
- **Vault docs** — vehicle ingestion source
- **FasTrac Tier 1** — 60+ DoD innovation orgs (AFWERX, SOFWERX, DIU, AFC, DARPA), 55+ Army bases, Academia partners
- **Regulatory Tracker** — wired to digest, filtered to upcoming solicitations

---

## 4. Infrastructure

### Auto-Deploy
- `.github/workflows/deploy-prod.yml` — watches main, builds + restarts containers on VPS
- Triggers on every merge to main
- Typical deploy lag: ~5 minutes from merge to live
- Deploy SSH key stored as GitHub Actions secret

### VPS (Hostinger)
- Host: 187.77.206.105
- Repo: `/root/gda-command-v2`
- Containers: `gda-frontend-v3`, `gda-backend-v3`, `gda-postgres-staging`
- Postgres: `gda_command_staging` via `gda-postgres-staging`

### Merge Workflow
1. Devin opens PR off `main`
2. CI runs (Build & Typecheck + Tests)
3. Once green, squash-merge with branch delete
4. Auto-deploy fires within minutes
5. Status visible at https://gda.csr-llc.tech

Branch protection on main:
- `allow_auto_merge = true`
- Required status checks: none currently enforced (intentionally — auto-merge gating proved noisy)
- Squash-merge only, branch deletion on merge

---

## 5. Known Open Items

### Carried over to next sprint
- **#884 Scoring & Doctrine Config page** — Devin re-pushing from session workspace
- **#887 Shipley Pipeline Coverage card** — spec filed, awaiting Devin pickup

### Spec on file (not yet picked up)
See `docs_refresh/issues_open.json` for current open issue inventory (36 issues).

---

## 6. Tone & Operator Preferences

- Plain language. No jargon. No emoji in code or docs.
- "Do it right, not fast."
- Operator's time is constrained — system removes them from operational loop while keeping them in control of decisions.
- One source of truth — if data appears in multiple places, it must match.
- A feature isn't done until it survives deploy, passes tests, and fails visibly when something breaks.

---

*This file is regenerated on operational milestones. It supplements `GDA-COMMAND-MASTER-DOC.md` (architecture-level) and `roadmap/stabilization-roadmap-2026-05.md` (sprint planning).*
