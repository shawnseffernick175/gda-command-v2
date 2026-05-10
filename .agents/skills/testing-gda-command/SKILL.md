---
name: testing-gda-command
description: Test GDA Command v2 end-to-end. Use when verifying UI pages, API endpoints, or new milestone features.
---

# Testing GDA Command v2

## Prerequisites
- Node v22+
- npm workspaces (monorepo)
- No external services needed for mock mode (no DATABASE_URL = mock data)

## Devin Secrets Needed
- `N8N_API_KEY` — n8n REST API key for workflow queries (repo-scoped)
- `GDA_WEBHOOK_KEY` — x-gda-key header value for n8n webhook auth (repo-scoped)

## Setup
```bash
# 1. Kill any stale processes on ports 3000/3001 first
fuser 3000/tcp 2>/dev/null | xargs kill -9 2>/dev/null
fuser 3001/tcp 2>/dev/null | xargs kill -9 2>/dev/null

# 2. Build shared types
npm run build --workspace=@gda/shared

# 3. Start backend (port 3001)
node --env-file=packages/backend/.env node_modules/.bin/tsx watch packages/backend/src/server.ts

# 4. Start frontend (port 3000, proxies /api to :3001)
npm run dev --workspace=@gda/frontend

# 5. Verify backend
curl http://localhost:3001/health
```

**Important:** If frontend starts on port 3002 instead of 3000, a stale process is occupying port 3000. Kill it with `fuser 3000/tcp | xargs kill -9` and restart the frontend. The Vite proxy config expects the frontend on :3000 proxying to backend :3001.

## Pages & Routes
| Route | Page | Key Features |
|---|---|---|
| `/` | Launchpad | KPI cards, 4-column command signals grid, funnel, top 10 opps, quick-access cards |
| `/qa-center` | QA Center | Health checks, failures table, live/mock badge |
| `/ops-tracker` | Ops Tracker | Opportunity list, filters (status/dept/Pwin), Qualify dry-run |
| `/pipeline` | Pipeline | Pipeline-status rows, read-only, audit strip |
| `/opportunities/:id` | Opportunity Detail | OODA analysis, strengths/risks, sources, breadcrumb |
| `/financial-bible` | Financial Bible (index) | 7 KPI navigation cards, "Select a KPI" prompt |
| `/financial-bible/:key` | Financial Bible (drill-down) | Summary cards, trend chart, insights, line items table |
| `/doctrine` | Doctrine | Drafts across sprints, finalization gate checks, publish runs |
| `/intel` | Intel Hub | Morning briefing, feed items, deep research reports, competitor watch |
| `/capture` | Capture Planner | Capture plans, BD activities, milestones, gate review |
| `/prompts` | Prompt Architect | 12 prompts, 6 categories, split-view detail with Body/Versions/Usage tabs |
| `/approvals` | Approvals Queue | Pending/resolved approvals, dry-run checks, approve/reject actions |
| `/compliance` | Compliance Matrix | Requirements tab (15 items), Clause Library tab (10 FAR/DFARS), filters |
| `/proposals` | Proposal Review | 6 proposals, split-view, 5 tabs (Overview/Volumes/Red Team/Scorecard/Timeline) |
| `/workflows` | Workflow Manager | Browse/filter n8n workflows (183 when live) |
| `/settings` | Settings | Connectors, feature flags, health check button |

## Global Components

### Financial KPI Strip
Rendered on **every page** below the nav bar, above main content.
- 7 KPIs: Orders ($42.5M), Sales ($31.8M), EBIT ($4.8M), ROS (15.0%), Funded Backlog ($68.4M), Backlog ($124.6M), Gross Profit ($9.5M)
- Change indicators vs prior period: All green ▲ except Funded Backlog which is red ▼-5.1%
- Each KPI is clickable → navigates to `/financial-bible/:key`
- Collapsible via ▲/▼ button on right side (hides change indicators when collapsed)
- Period label: FY25-Q2

### Grouped Navigation Bar
Nav bar uses 3 groups:
- **BD Tools**: Launchpad, Ops Tracker, Pipeline, Capture, Approvals
- **Analysis**: Intel Hub, Compliance, Proposals, Financials
- **Platform**: QA Center, Doctrine, Workflows, Settings

Active page gets blue highlight. Group labels shown in uppercase.

## Launchpad Command Signals Grid

The Launchpad displays a **4-column grid** of command signals below the KPI summary cards:

### Data Source Behavior
- Backend endpoint: `GET /api/dashboard/command-signals`
- When n8n is reachable: Shows real data with green "Live n8n" badge. Counts will vary based on real capture plan data.
- When n8n is unreachable: Falls back to mock data with blue "Mock data" badge.
- The `captureSource` field in the API response tells you which path was used ("n8n" or "mock").

### Signal Cards (with n8n live data — counts may vary)
| Card | Icon | Content |
|---|---|---|
| Fast-Track Signals | ⚡ | Opportunities eligible for fast-track, with urgency indicators |
| Active Risks | 🔴 | High-likelihood/impact risks from capture plans, with likelihood badges |
| Decisions Pending | 🎯 | Pending bid/no-bid decisions with agency, dollar value, and Pwin % |
| Due Soon | 📅 | At-risk/overdue milestones + approvals badge linking to /approvals |

### Mock Data Expected Values (when n8n is unavailable)
- Fast-Track Signals: **3** (USACE FUDS RFP, Air Force Tyndall, DOE Oak Ridge)
- Active Risks: **6** (from 5 capture plans)
- Decisions Pending: **2** (Air Force Tyndall 55% Pwin, NASA KSC 35% Pwin)
- Due Soon: **8** (milestones sliced to 8)
- Approvals badge: **7 approvals (1 critical)** → links to `/approvals`

### Pwin Display
- Pwin values are stored as whole-number percentages (e.g., `pwin: 72` means 72%)
- The frontend displays them as `{Math.round(dec.pwin)}% Pwin`
- **Do NOT multiply by 100** — that was a bug that caused 7200% instead of 72%

### Navigation Links
- Due Soon card: "7 approvals (1 critical)" badge → navigates to `/approvals`
- Top Opportunities: Now shows **10** entries (expanded from 5)

## Mock Data Overview

### Financial KPIs (7 total)
| KPI | Current | Prior | Plan | Change |
|---|---|---|---|---|
| Orders | $42.5M | $38.2M | $45.0M | +11.3% ▲ |
| Sales | $31.8M | $29.5M | $33.0M | +7.8% ▲ |
| EBIT | $4.8M | $4.13M | $4.95M | +15.5% ▲ |
| ROS | 15.0% | 14.0% | 15.0% | +7.1% ▲ |
| Funded Backlog | $68.4M | $72.1M | $70.0M | -5.1% ▼ |
| Backlog | $124.6M | $118.3M | $130.0M | +5.3% ▲ |
| Gross Profit | $9.5M | $8.555M | $9.9M | +11.5% ▲ |

### Financial Bible Drill-Down (Orders example)
- Summary: Current $42.50M, Plan $45.00M, Variance $2.50M (-5.6%), Prior $38.20M
- Trend: 6 periods (FY24-Q1 through FY25-Q2)
- Line Items: 5 records (USACE FUDS $12.4M, EPA Superfund $8.5M, Air Force Tyndall $14.2M, DOE Oak Ridge $5.2M, NASA KSC $2.2M)
- Breadcrumb: Launchpad / Financial Bible / [KPI name]

### Opportunities (10 total)
- Pwin range: 15% (lost) to 100% (won)
- Score range: 41.0 to 95.0
- Statuses: discovery(3), qualified(2), pipeline(3), won(1), lost(1)
- Total pipeline value: $79.3M

### Capture Plans (5 total)
| Plan | Value | Pwin | Phase | Bid Decision |
|---|---|---|---|---|
| USACE FUDS IDIQ | $180M | 72% | proposal_prep | bid |
| Air Force Tyndall | $42M | 55% | pre_rfp | pending |
| NASA KSC | $12.8M | 35% | pre_rfp | pending |
| EPA Superfund | $8.5M | 60% | evaluation | bid |
| DOE Oak Ridge | $15.2M | 100% | awarded | bid |

**Summary stats**: Active Plans 5, Total Value $258.5M, Avg Pwin 64%, Bid 3, Pending 2, At-Risk Milestones 1

### Approvals Queue (10 total)
- Pending: 7, Critical: 1, Expiring Soon: 0, Approved: 1, Rejected: 1, Expired: 1
- Categories: Qualify, Bid Decision, Doctrine Publish, Teaming, Deploy, Budget Override, Gate Review
- Each approval has expandable dry-run checks (PASS/WARN/FAIL)
- Approve/Reject buttons trigger dry-run modal with correlation ID

### Prompt Architect (12 prompts across 6 categories)
**Summary strip**: Total 12, Active 11, Draft 1, Archived 0, Starred 4, Categories 6

| # | Name | Category | Status | Version | Uses | Starred |
|---|---|---|---|---|---|---|
| 1 | Proposal Executive Summary Writer | proposal | active | v4 | 31 | yes |
| 2 | Capture Plan First Draft | capture | active | v3 | 24 | yes |
| 3 | Red Team Review Checklist | proposal | active | v3 | 22 | yes |
| 4 | Email Drafter — Agency Follow-Up | general | active | v2 | 19 | no |
| 5 | Compliance Matrix Analyzer | compliance | active | v2 | 18 | yes |
| 6 | Past Performance Write-Up | proposal | active | v2 | 15 | no |
| 7 | Technical Volume Section Writer | proposal | draft | v2 | 14 | no |
| 8 | Competitor Intelligence Brief | research | active | v2 | 12 | no |
| 9 | OODA Loop Analysis | analysis | active | v1 | 8 | no |
| 10 | Teaming Partner Assessment | capture | active | v1 | 7 | no |
| 11 | SAM.gov Opportunity Screener | research | active | v1 | 6 | no |
| 12 | Doctrine Sprint Summary | general | active | v1 | 4 | no |

**Category filter counts**: proposal(4), capture(2), general(2), compliance(1), research(2), analysis(1)

### Compliance Matrix
**Summary strip**: Compliant=8, Partial=3, Gap=3, N/A=1, Score=68% (amber)
- Requirements tab: 15 requirements across 3 solicitations (USACE FUDS, Tyndall, NASA KSC)
- Clause Library tab: 10 references (7 FAR, 3 DFARS)
- Expandable cards with evidence, notes, related clause badges
- Solicitation filter: USACE FUDS → 7 requirements
- DFARS filter → 3 clauses; expanded DFARS 252.204-7012 has 4 pitfalls, 3 related clauses, 3 applicability tags

### Proposal Review (6 proposals across 6 agencies)
**Summary strip**: Total=6, Active=4, Red Team Open=3, Avg Compliance=69% (amber), Pipeline Value=$444.9M, Agencies=6

| ID | Title | Agency | Status | Score | Value | Compliance |
|---|---|---|---|---|---|---|
| PROP-001 | USACE FUDS IDIQ Environmental Remediation | US Army Corps of Engineers | red_team | 84 | $48.5M | 87% |
| PROP-002 | Air Force Tyndall AFB Reconstruction Support | US Air Force | in_review | 72 | $125.0M | 72% |
| PROP-003 | NASA KSC Launch Complex Modernization | NASA | draft | — | $210.0M | 27% |
| PROP-004 | DHS CISA Cyber Assessment BPA | Dept of Homeland Security | submitted | 91 | $18.2M | 90% |
| PROP-005 | DCSA NBIS Platform Support | Defense Counterintelligence & Security Agency | final | 88 | $34.7M | — |
| PROP-006 | SOCOM C-UAS Technology Evaluation | US Special Operations Command | archived | 82 | $8.5M | — |

**Active proposals** (for avg compliance calculation): PROP-001, 002, 003, 005 (excludes submitted PROP-004 and archived PROP-006)
**Avg Compliance**: (87+72+27+90)/4 = 69% — note: code uses `activeStatuses` filter
**Red Team Open**: 3 (all from PROP-001; PROP-006 has 1 finding with status "accepted_risk" which does NOT count as open)

#### USACE FUDS (PROP-001) Detail Tabs

**Overview tab:**
- Scores: Overall Score=84 (green, ≥80), Compliance=87% (green)
- Red Team: 3 Open (red) / 2 Addressed (green) / 5 Total
- Document: 5 Volumes, 127 Pages (4+45+32+28+18), 50.4K Words
- Schedule: Days Overdue (dynamic), Due Date Jun 15, 2025
- Win Themes: 4 blue badges ("Proven FUDS remediation experience across 47+ sites", etc.)

**Red Team tab:**
- Summary: Critical=1, Major=2, Open=3, Addressed=2
- 5 findings, each with expandable card showing section, finding text, recommendation (blue left-border highlight), assigned_to, created_at
- RT-001-1: critical/open — "Transition plan does not address 30-day assumption..." → Assigned: James Chen
- RT-001-2: major/open — Arcadis GSA schedule rates
- RT-001-3: major/addressed — ISO 14001 QCP reference
- RT-001-4: minor/open — Win theme #3 unsubstantiated
- RT-001-5: observation/addressed — EPA CPARS rating period

**Scorecard tab:**
- Overall Score: 84 (large green text, font-size 40px)
- 84/100 points (100% total weight)
- Technical Approach: 34/40 (Weight: 40%) — green bar (85%)
- Management Plan: 16/20 (Weight: 20%) — green bar (80%)
- Past Performance: 23/25 (Weight: 25%) — green bar (92%)
- Cost Reasonableness: 11/15 (Weight: 15%) — **amber bar** (73%, between 60-79%)
- All evaluators: Red Team Lead

**Timeline tab:**
- "Final submission due: Jun 15, 2025"
- 6 milestones with colored dots:
  - Compliance Matrix Complete — completed (green), Apr 15
  - First Draft — All Volumes — completed (green), Apr 30
  - Pink Team Review — completed (green), May 5, "14 findings, all resolved"
  - Red Team Review — on_track (blue), May 9, "5 findings, 2 addressed"
  - Gold Team Final — on_track (blue), May 20
  - Production & Submission — on_track (blue), Jun 15, "FedConnect submission"

**Volumes tab:**
- 5 volumes with compliance % and type badges:
  - Executive Summary: 95% (green)
  - Technical Approach Vol I: 88% (green)
  - Management Plan Vol II: 82% (green)
  - Past Performance Vol III: 92% (green)
  - Cost/Price Volume IV: 78% (amber)

#### Filter Behavior
- Status "Red Team" → 1 proposal (PROP-001)
- Status "Draft" → 1 proposal (PROP-003)
- Agency "NASA" → 1 proposal (PROP-003)
- Search "DCSA" → 1 proposal (PROP-005, matches title)
- Clear filters restores all 6 proposals

### Doctrine (8 drafts)
- Sprints: S-205 (3 drafts), S-206 (5 drafts)
- Statuses: draft(3), finalized(4), blocked(1)
- Publish runs: 3 total
- Finalize S-206: success, 4/4 gates pass, GDA-DOC-* correlation ID

### Intel Hub
- Feed: 12 items, 6 unread (mock); real n8n data when connected
- Deep Research: 12 real reports when n8n connected (BAE Systems, GDIT, SAIC, ManTech, etc.), 4 mock otherwise
- Competitors: 10 real profiles when n8n connected, 5 mock otherwise
- Dynamic source badge: green "Live — n8n" per tab or blue "Mock data"

## Testing Tips
- When DATABASE_URL is not set, all pages show "Mock data" blue badge
- All API responses use GDA envelope: `{ success, workflow, action, dryRun, data, meta, error }`
- Dry-run operations use `dryRun: true` and return correlation IDs starting with "GDA-"
- Breadcrumb on Opportunity Detail changes based on referrer (Launchpad/Ops Tracker/Pipeline)
- Financial KPI Strip appears on ALL pages — verify by navigating to any page
- Financial Bible drill-down has stale-fetch protection (rapid KPI switching won't show wrong data)
- Prompt Architect uses split-view layout: clicking a prompt card opens the detail panel on the right side
- Prompt list default sort is by `usageCount` descending (most-used first)
- Proposal Review uses split-view layout: proposal list on left, detail panel with 5 tabs on right
- First proposal is auto-selected on page load, so detail panel is immediately visible
- Avg Compliance uses only active statuses (red_team, in_review, draft, final) — NOT submitted/archived
- Scorecard color thresholds: ≥80% green, ≥60% amber, <60% red — Cost Reasonableness at 73% is the only amber bar for PROP-001
- After code changes, the backend hot-reload (tsx watch) might need a manual restart if routes change — if you see 500 errors on pages that worked before, restart the backend
- Use `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz` to maximize browser before recording
- If HMR gets into a bad state (page stuck on "Loading..."), kill all node processes, clear ports, and do a fresh restart
