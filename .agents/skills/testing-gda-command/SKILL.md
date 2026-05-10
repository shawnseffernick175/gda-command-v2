---
name: testing-gda-command
description: Test GDA Command v2 end-to-end. Use when verifying UI pages, API endpoints, or new milestone features.
---

# Testing GDA Command v2

## Prerequisites

- Node v22+ with npm workspaces
- No external services required for mock mode testing
- For live n8n testing, `N8N_API_KEY` and `N8N_API_URL` must be set in `packages/backend/.env`

## Devin Secrets Needed

- `N8N_API_KEY` (repo-scoped) — required only for live n8n health checks and workflow registry
- No secrets needed for mock-mode testing

## Server Setup

1. Build shared types first: `npm run build --workspace=@gda/shared`
2. Start backend: `node --env-file=packages/backend/.env node_modules/.bin/tsx watch packages/backend/src/server.ts` (port 3001)
3. Start frontend: `npm run dev --workspace=@gda/frontend` (port 3000, proxies /api to :3001)
4. Verify backend: `curl http://localhost:3001/health`
5. Verify frontend: `curl -s http://localhost:3000 | head -3` (should return HTML)

**Important**: If testing a newly merged PR, make sure to `git checkout main && git pull` and restart both servers. Old server processes may still be running pre-merge code. Kill them with `pkill -f tsx && pkill -f vite` before restarting.

## Mock Data Overview

When `DATABASE_URL` is not set, the app falls back to mock data. The source badge shows "Mock data" (blue) instead of "Live DB" (green).

### Opportunities (10 total)
- **Won (1)**: opp-008 USACE FUDS $18.5M, score 95.0
- **Pipeline (3)**: opp-001 USACE OU3 $24.5M (score 87.5), opp-004 Air Force Tyndall $42M (score 91.3), opp-010 NASA KSC $12.8M (score 82.7)
- **Qualified (2)**: opp-006 DOE Oak Ridge $31M, opp-002 EPA Region 4 $8.9M
- **Discovery (3)**: opp-003 Navy NAS Jacksonville $15.2M, opp-009 VA Phoenix $4.1M, opp-005 DLA CONUS $6.7M
- **Lost (1)**: opp-007 GSA PBS Region 3 $3.2M

### Expected Aggregates
- **Ops Tracker (all 10)**: Count 10, Total $166.9M, Avg Pwin 58%, Avg Score 72.4
- **Pipeline (3 only)**: Count 3, Total $79.3M, Avg Pwin 74%, Avg Score 87.2
- **Dashboard KPIs**: Total 10, Pipeline Value $79.3M, Avg Pwin 58%, Avg Score 72.4
- **Funnel counts**: Discovery 3/$26.0M, Qualified 2/$39.9M, Pipeline 3/$79.3M, Won 1/$18.5M, Lost 1/$3.2M
- **Top 5 by Score**: opp-008 (95), opp-004 (91.3), opp-001 (87.5), opp-010 (82.7), opp-006 (78.9)

### Rich Detail Mock Data
Three opportunities have hand-crafted OODA analysis: opp-001, opp-004, opp-010. All others get auto-generated generic analysis. Use opp-001 for detailed assertions:
- Executive summary mentions "Fort Bragg" and "$24.5M"
- Recommended action: "Pursue aggressively"
- OODA Observe: 5 items with source chips
- OODA Orient: 4 items (risk, strength, inference, strength)
- OODA Decide: 3 options, "Pursue as Prime" marked Recommended
- OODA Act: 4 action steps with Owner/Due/Priority
- Strengths: exactly 4 items
- Risks: exactly 3 items
- Competitive Landscape: mentions AECOM, Tetra Tech, Arcadis, Parsons
- Sources: 3 rows (SAM.gov, AECOM contract award, Envision FUDS)
- Learning: Source Count 3, 2 coverage gaps

## Page-Specific Testing

### Launchpad (`/`)
- KPI strip with 4 cards: Total Opportunities, Pipeline Value, Avg Pwin, Avg Score
- Opportunity Funnel visualization with 5 stages (discovery, qualified, pipeline, won, lost)
- Each funnel row shows count, value bar, dollar amount, and Pwin percentage
- "Top Opportunities by Score" list with 5 clickable entries linking to `/opportunities/:id`
- Quick-access cards: QA Center, Ops Tracker, Pipeline, Workflows, Settings (5 total)
- "Mock data" badge visible when no DATABASE_URL
- Verify KPI endpoint: `curl http://localhost:3001/api/dashboard/kpis`

### QA Center (`/qa-center`)
- Mock mode: 6 health checks, "degraded" status (5/6 pass), "Mock data" badge
- Live n8n mode: 8 health checks, "Live n8n" badge, real HTTP status codes
- Failures table columns differ between mock and live modes

### Ops Tracker (`/ops-tracker`)
- Default sort: Score DESC (highest first)
- 10 rows with all statuses
- "Qualify" buttons appear only on discovery-status rows (3 rows)
- Qualify dry-run modal shows correlation ID starting with "GDA-"
- Filters: search (ID/title), status dropdown, department dropdown, min Pwin
- Rows are clickable — navigate to `/opportunities/:id` with `state={{ from: "/ops-tracker" }}`

### Pipeline (`/pipeline`)
- Read-only — NO Qualify buttons, NO Actions column
- Default sort: qualified_at DESC (opp-001 May 1 → opp-010 Apr 25 → opp-004 Apr 20)
- 3 rows only (pipeline status)
- Audit acknowledgement strip visible per S-008 spec
- Filters: search, department dropdown, min Pwin (no status filter)
- Rows are clickable — navigate to `/opportunities/:id` with `state={{ from: "/pipeline" }}`

### Opportunity Detail (`/opportunities/:id`)
- Reached by clicking any row in Ops Tracker, Pipeline, or Top Opportunities on Launchpad
- Breadcrumb is context-aware based on navigation origin:
  - From Ops Tracker → breadcrumb shows "Ops Tracker"
  - From Pipeline → breadcrumb shows "Pipeline"
  - From Launchpad → breadcrumb shows "Launchpad"
  - Default (direct URL) → breadcrumb shows "Ops Tracker"
- Sections: Core Fields, Executive Summary (with Recommended Action), OODA Analysis (Observe/Orient/Decide/Act), Strengths & Risks, Competitive Landscape, Sources, Learning & Feedback
- Score color: green (>=80), amber (>=60), red (<60)
- Status badge color-coded: discovery gray, qualified blue, pipeline green, lost red, won yellow
- Verify detail endpoint: `curl http://localhost:3001/api/opportunities/opp-001/detail`
- Source badge always shows "Mock data" (detail endpoint uses mock data even if DB is configured)
- **Testing breadcrumb navigation**: To distinguish a working vs broken implementation, test navigation from at least 2 different origins (e.g., Ops Tracker and Launchpad) and verify the breadcrumb text changes accordingly.

### Workflow Manager (`/workflows`)
- Shows all n8n workflows from the live API when `N8N_API_KEY` is configured
- "Live n8n" badge (green) when connected, "Not configured" badge otherwise
- Summary strip: Total, Active, Inactive counts (verify against `curl http://localhost:3001/api/workflows/registry`)
- Category chips: API, QA, Doctrine, Cron, Deploy, Intel, Other — each with count. Categories are derived from workflow name prefixes (e.g., `GDA.api.*` → API, `GDA.cron.*` → Cron)
- Search filter: type text to filter by workflow name (case-insensitive). Counter updates to "X of Y workflows"
- Category filter: click a chip to filter by category. Click "All" to reset
- Status dropdown: filter by Active/Inactive/All
- Sortable columns: Name, Status, Nodes, Updated. Click column header to sort (arrow indicator shows direction)
- Table columns: Name (with category color chip), Status (Active green / Inactive gray badge), Nodes (count), Updated (relative time like "7d ago")
- **Key test**: Search + category filter combine — e.g., search "doctrine" with All categories shows 2 results
- **Adversarial check**: If n8n connection fails, the page should show an error state, not crash

### Settings (`/settings`)
- Fetches from two endpoints on load: `GET /api/settings` and `GET /health`
- **Environment section**: Node.js version, Uptime, PID, Port, Environment (development/production)
- **Connectors section** — 3 cards showing configuration status:
  - n8n Webhooks: "Connected" (green) when `N8N_BASE_URL` is set
  - n8n REST API: "Connected" (green) when `N8N_API_BASE` and `N8N_API_KEY` are set
  - PostgreSQL: "Not configured" (amber) when `DATABASE_URL` is missing, shows "Missing: DATABASE_URL"
- **Feature Flags section**: Shows `QUALIFY_WRITES_ENABLED` flag with Enabled/Disabled badge
- **Gateway Health section**: "Run Health Check" button that calls `/health` and shows response time + status
  - Health cards: Status (ok/error), Webhook, n8n API, Database connectivity
- **API Endpoints table**: 10 rows listing all available endpoints with Method, Endpoint path, Description
- **Important**: The `fetchGatewayHealth()` function calls `/health` directly (not `/api/health`) because the health endpoint is at root level. The Vite proxy has a separate entry for `/health`. If this breaks, you may see 404 errors on the health check button.
- Verify settings endpoint: `curl http://localhost:3001/api/settings`

## Navigation

- **Nav bar**: 6 items — Launchpad, QA Center, Ops Tracker, Pipeline, Workflows, Settings
- Active nav item is highlighted with blue background/text
- All pages are accessible via nav bar clicks and direct URL navigation
- Launchpad quick-access cards provide alternate navigation to all pages

## Testing Tips

- Always maximize the browser window before recording: `sudo apt-get install -y wmctrl 2>/dev/null; wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`
- Close browser extension popups before starting recording
- When switching between branches for testing, always rebuild shared package and restart both servers
- The frontend Vite proxy handles /api routing — test via frontend port (3000), not backend port (3001), for realistic E2E testing
- Use `curl` to verify backend endpoints independently before browser testing to catch server-side issues early
- No CI is configured on this repo, so verification is manual
- When testing row clicks, verify the Qualify button on discovery rows does NOT trigger navigation (uses `e.stopPropagation()`)
- For KPI value verification, calculate expected values from `packages/backend/src/data/opportunities-mock.ts` before testing
- For Workflow Manager testing, get exact expected counts from `curl` before asserting in the UI — workflow counts may change as the user adds/removes n8n workflows
- The Vite proxy config (`packages/frontend/vite.config.ts`) proxies both `/api` and `/health` separately to backend port 3001. If either proxy entry is missing, the corresponding frontend feature will break with 404s.
