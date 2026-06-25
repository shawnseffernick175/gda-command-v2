# GDA Command v2 — Operational Status

**Last Updated:** 2026-06-25
**Production:** https://gda.csr-llc.tech
**Repository:** https://github.com/shawnseffernick175/gda-command-v2
**Latest commit on main (live in prod):** `74986e1` (migration-parity baseline 42→19 + grade-removal doc fix, PR #897)
**Schema version in prod:** `v3_102_capture_review_engine`

---

## 0. Session Reconciliation — 2026-06-25

Work completed this session (Financial Bible defect pass + FORCE booking + rate recommendation):

1. **FORCE task order booked to Orders ($107,279,341.63).** Fully-executed FORCE task order (W15P7T19D0206 / W56KGU26FA010, W6QK ACC-APG, Army Aberdeen Proving Ground) loaded to the vault as doc id=194 (bucket "contract"). `task_orders` id=5 updated with real ceiling $107,279,341.63, funded $30,000, PoP 2026-06-15 → 2031-12-30, `is_seed=false` (now the only non-seed task order). Booked $107,279,341.63 to Orders in `financial_actuals` (source='income_statement', period='FY26 Jun', FY2026 Q3, `is_seed=false`, source_doc_id=194). **Revenue/billing stays $0 until July 1, 2026** per operator instruction — FORCE per-year amounts (Base Yr through 6-mo extension) tie to $107.3M exactly, spread = each contract year (Jul1–Jun30) ÷ 12.

2. **Financial Bible full-tab audit complete; 5 devin-ready GitHub issues filed.** Operator verdicts: AI Analyze and Definitions tabs are GOOD (no change). All other tabs have defects, now specced in:
   - **#994** Global UI rules (exec charts, sticky+sortable tables, number formatting, visual alignment)
   - **#995** KPI Header rebuild — 6-tile exec header (ORDERS · SALES · EBIT · ROS · FUNDED BACKLOG · BACKLOG), CY/FY selector on header, CY-to-date default, real Orders/Backlog wiring
   - **#996** Backend quick fixes — Ingestion Coverage 500 crash, remove AOP Capture tab from FB, FORCE note cleanup (Vault ID 120 → 194)
   - **#997** Contract Waterfall rebuild — revenue+profit forecast (was a Gantt), ceiling/12 spread, per-contract margin, pipeline layer
   - **#998** Parser/data fixes — Project Revenue mapping, AP detail, AR 4-bucket aging, IS/AOP dedup + GM units + month ordering
   - Full spec preserved at `docs/dev-notes/2026-06-25_fb-defect-spec.md`.
   - Devin opened PRs **#999 (→#996), #1000 (→#997), #1001 (→#995)**; as of session end CI was not yet clean-green on any (Schema dry-run, Lighthouse, token/JSX lint failures). No PR yet for #994 or #998.

3. **Envision indirect rate recommendation produced for the CFO.** Forward-pricing rates derived from FY26 YTD trial balance, reconciled to Envision's own allocation pools: Fringe 36.0%, Overhead 49.6% onsite / 54.7% offsite, G&A 4.7%, Material Handling 1.4%. Wrap ~1.94x onsite / ~2.00x offsite; bill ~2.10–2.20x at 8–10% fee. Book-derived, NOT DCAA-approved. Recorded at `docs/canonical/envision_indirect_rates_v1.md`. Feeds the <8% gross-margin doctrine rule.

**Open threads:** (a) Review/merge/deploy/verify Devin PRs #999–1001 + remaining issues #994, #998 as PRs land. (b) AR-by-contract breakdown — pending operator's BVN/subcontractor→contract mapping.

---

## 0. Session Reconciliation — 2026-06-18

Decisions made and verified live in production this session (docs updated to match):

1. **V3 severed from V2/n8n stack.** Added dedicated `traefik-v3` service (`gda-traefik-v3`, `traefik:v3.6.8`) on a V3-owned `edge` network (`gda-command-v2_edge`); killed the old n8n stack and its `n8n_default` network. Cert resolver `mytlschallenge` (gda.csr-llc.tech is a SAN on the app.csr-llc.tech cert). gda / app / gda-mcp all return HTTP 200 with valid SSL. (See `docs/deploy/v3-backend.md`, `docs/GDA-COMMAND-MASTER-DOC.md`.)
2. **IDIQ doctrine reaffirmed in code.** Funded Task Orders belong in the Contract Waterfall; parent IDIQ vehicles do not. Waterfall pulls from `task_orders`; the 3 IDIQs (Tradewind, CBM+, GSA Marketplace) sit in the `pipeline_items` board, not the Waterfall.
3. **Letter grades fully retired (migration `v3_087`).** `grade`/`grade_evidence` columns, `idx_opps_grade`, and `opportunity_grade_sources` are gone in prod. **Pwin (continuous %) is the sole fit metric**; "Hot" = Pwin ≥ 70%. Architecture + API-contract docs updated to remove all grade references.
4. **Migration-folder parity reconciled (PR #897).** apps↔db/v3 parity baseline shrunk 42→19; 23 safe divergences resolved. Remaining 19 renumbered-history divergences tracked in issue #898.

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
