---
name: testing-gda-command
description: Test GDA Command v2 end-to-end. Use when verifying UI pages, API endpoints, or new milestone features.
---

# Testing GDA Command v2

## Prerequisites
- Node v22+
- npm workspaces (monorepo)
- No external services needed for mock mode (no DATABASE_URL = mock data)

## Setup
```bash
# 1. Build shared types
npm run build --workspace=@gda/shared

# 2. Start backend (port 3001)
node --env-file=packages/backend/.env node_modules/.bin/tsx watch packages/backend/src/server.ts

# 3. Start frontend (port 3000, proxies /api to :3001)
npm run dev --workspace=@gda/frontend

# 4. Verify backend
curl http://localhost:3001/health
```

## Pages & Routes
| Route | Page | Key Features |
|---|---|---|
| `/` | Launchpad | KPI strip (10 opps, $79.3M, 58%, 72.4), funnel, top 5, quick-access cards |
| `/qa-center` | QA Center | Health checks, failures table, live/mock badge |
| `/ops-tracker` | Ops Tracker | 10 rows, filters (status/dept/Pwin), Qualify dry-run on discovery rows |
| `/pipeline` | Pipeline | 3 pipeline-status rows, read-only, audit strip |
| `/opportunities/:id` | Opportunity Detail | OODA analysis, strengths/risks, sources, breadcrumb |
| `/financial-bible` | Financial Bible (index) | 7 KPI navigation cards, "Select a KPI" prompt |
| `/financial-bible/:key` | Financial Bible (drill-down) | Summary cards, trend chart, insights, line items table |
| `/doctrine` | Doctrine | 8 drafts across 2 sprints, finalization gate checks, publish runs |
| `/intel` | Intel Hub | Morning briefing, 12 feed items, 4 research reports, 5 competitors |
| `/capture` | Capture Planner | 5 capture plans, 12 BD activities, 17 milestones, gate review |
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
- **BD Tools**: Launchpad, Ops Tracker, Pipeline, Capture
- **Analysis**: Intel Hub, Financials
- **Platform**: QA Center, Doctrine, Workflows, Settings

Active page gets blue highlight. Group labels shown in uppercase.

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

### USACE FUDS Detail (cap-001)
- Win Themes: 4 + 3 discriminators
- Teaming: GDA (Prime/CONFIRMED), Arcadis (Sub/CONFIRMED), Enviro-Compliance (Sub/NEGOTIATING)
- Milestones: 6 (5 on_track, 1 at_risk)
- Gates: 3 (Gate 1 passed, Gate 2 passed, Gate 3 pending)
- Risks: 3 (all with mitigation plans)

### Gate Review Dry-Run (USACE FUDS, Gate 3)
- Overall: **CONDITIONAL (3/5 passed)**
- Teaming Partners Confirmed: WARN — "1 partner(s) not yet confirmed"
- Win Themes Defined: PASS — "4 win theme(s) defined"
- Risks Mitigated: PASS — "All risks have mitigation plans"
- Milestones On Track: WARN — "1 milestone(s) at risk"
- Discriminators Identified: PASS — "3 discriminator(s) identified"
- Correlation ID: GDA-GATE-*

### Activities (12 total)
- Types: meeting(2), research(2), call(2), teaming_discussion(2), gate_review(1), site_visit(1), proposal_work(1), email(1)
- All have Outcome sections

### Milestones (17 total across all plans)
- Completed: 4
- On Track: 12
- At Risk: 1
- Overdue: 0

### Doctrine (8 drafts)
- Sprints: S-205 (3 drafts), S-206 (5 drafts)
- Statuses: draft(3), finalized(4), blocked(1)
- Publish runs: 3 total
- Finalize S-206: success, 4/4 gates pass, GDA-DOC-* correlation ID

### Intel Hub
- Feed: 12 items, 6 unread
- Briefings: 3 dates (today, yesterday, 2 days ago)
- Research: 4 reports (2 completed, 1 in_progress, 1 queued)
- Competitors: 5 profiles sorted by threat score (Tetra Tech 92 → Hensel Phelps 68)

## Testing Tips
- When DATABASE_URL is not set, all pages show "Mock data" blue badge
- All API responses use GDA envelope: `{ success, workflow, action, dryRun, data, meta, error }`
- Dry-run operations use `dryRun: true` and return correlation IDs starting with "GDA-"
- Breadcrumb on Opportunity Detail changes based on referrer (Launchpad/Ops Tracker/Pipeline)
- Financial KPI Strip appears on ALL pages — verify by navigating to any page
- Financial Bible drill-down has stale-fetch protection (rapid KPI switching won't show wrong data)
- Use `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz` to maximize browser before recording
