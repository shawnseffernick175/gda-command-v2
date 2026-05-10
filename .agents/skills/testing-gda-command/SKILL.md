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
| `/compliance` | Compliance Matrix | Requirements tab (15 items), Clause Library tab (10 FAR/DFARS), score 68% |
| `/proposals` | Proposal Review | 6 proposals, split-view, 5 tabs (Overview/Volumes/Red Team/Scorecard/Timeline) |
| `/contacts` | Contacts & Relationships | 25 contacts, split-view, 5 tabs (Overview/Meeting Notes/Relationships/Opportunities/Teaming) |
| `/reports` | Reporting & Export | 8 templates, 12 reports, 4 schedules, 5 exports, generate modal |
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
- **Analysis**: Intel Hub, Compliance, Proposals, Contacts, Financials
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
| Accelerators | ⚡ | Time-sensitive opportunities requiring accelerated action |
| Active Risks | 🔴 | High-likelihood/impact risks from capture plans, with likelihood badges |
| Decisions Pending | 🎯 | Pending bid/no-bid decisions with agency, dollar value, and Pwin % |
| Due Soon | 📅 | At-risk/overdue milestones + approvals badge linking to /approvals |

### Mock Data Expected Values (when n8n is unavailable)
- Accelerators: **3** (USACE FUDS RFP, NASA KSC Launch Ops, DHA MHS GENESIS)
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
- Requirements tab: 15 items across 3 solicitations (USACE FUDS, Tyndall, NASA KSC)
- Clause Library tab: 10 references (FAR=7, DFARS=3)
- Expandable requirement cards show evidence, notes, related clause badges
- Expanded clause shows pitfalls, related clauses, applicability tags

### Proposal Review (6 proposals)
**Summary strip**: Total=6, Active=4, Red Team Open=3, Avg Compliance=69% (amber), Pipeline=$444.9M, Agencies=6
- Split-view: clickable list on left, 5-tab detail panel on right
- Tabs: Overview (scores/schedule), Volumes (compliance %), Red Team (expandable findings), Scorecard (weighted bars), Timeline (milestone dots)
- Scorecard for USACE FUDS: 84/100pts — Tech 34/40, Mgmt 16/20, PP 23/25, Cost 11/15 (amber bar at 73%)
- Status filter: "Red Team" → exactly 1 proposal

### Contacts & Relationships (25 contacts)
**Summary strip**: Total Contacts=25, Active Relationships=21, Pending Actions=15, Teaming Gaps=13
- Split-view: scrollable contact list on left, 5-tab detail panel on right
- Tabs: Overview, Meeting Notes, Relationships, Opportunities, Teaming
- 14 agencies represented: USACE(4), Air Force(3), NASA(3), DHS(2), EPA(2), SOCOM(2), Army(2), DCSA(1), NAVFAC(1), DOE(1), DoD(1), DARPA(1), DoS(1), VA(1)
- Statuses: active(21), prospect(3), inactive(1)
- Strengths: strong(5), moderate(10), weak(7), new(3)

**Key test contacts**:
- CON-001 James Richardson: USACE, Contracting Officer, email james.richardson@usace.army.mil, 4 tags, Quick Stats 2/2/2/1
- CON-018 Gregory Martinez: DOE, Inactive status — only inactive contact (used for filter testing)
- PFAS-tagged contacts: Davis, Nguyen, Adams, Patel, Reeves, Price (exactly 6 — used for search testing)

**Meeting Notes (CON-001 first note)**:
- Title: "FUDS Task Order 4 Pre-Proposal Conference"
- Attendees: James Richardson, Shawn Seffernick, Maria Chen (3)
- Topics: 4 badge tags
- Action Items: 2 total — 1 completed (Shawn Seffernick), 1 open (James Richardson)

**Relationships (CON-001)**:
- Lt. Col. Marcus Davis: Supervisor, Strong
- Sarah Kim: Peer, Moderate

### Reporting & Export
**Summary strip**: Templates=8, Reports Generated=12, Completed=10, Failed=1 (red), Active Schedules=4, Export Jobs=5, Categories=6
- 4 tabs: Templates (grid + detail panel), History (list + detail), Schedules, Exports
- Generate Report dry-run modal: format selector (PDF/Excel/PPTX/CSV), section toggles, correlation ID
- SITREP category filter → exactly 1 template
- Failed report RPT-012 shows null pages/size as "—" with red error notes
- 4 active + 1 paused schedule

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
- Split-view pages (Prompts, Proposals, Contacts, Knowledge Documents) auto-select the first item on load
- Contact search matches against name, title, agency, department, tags, and relationship history text
- Color lookup maps (STRENGTH_COLORS, STATUS_COLORS) use nullish coalescing `?? "#6b7280"` for defensive fallback — if a new status/strength is added to mock data, the UI won't break
- After code changes, the backend hot-reload (tsx watch) might need a manual restart if routes change — if you see 500 errors on pages that worked before, restart the backend
- Use `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz` to maximize browser before recording
- If HMR gets into a bad state (page stuck on "Loading..."), kill all node processes, clear ports, and do a fresh restart
- Knowledge Base document detail uses separate `selectedDocId` (user intent) and `selectedDoc` (fetched data) state to prevent infinite fetch loops on rapid clicks
