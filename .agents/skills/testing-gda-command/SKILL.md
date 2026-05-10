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

## Page-Specific Testing

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

### Pipeline (`/pipeline`)
- Read-only — NO Qualify buttons, NO Actions column
- Default sort: qualified_at DESC (opp-001 May 1 → opp-010 Apr 25 → opp-004 Apr 20)
- 3 rows only (pipeline status)
- Audit acknowledgement strip visible per S-008 spec
- Filters: search, department dropdown, min Pwin (no status filter)

## Testing Tips

- Always maximize the browser window before recording: `sudo apt-get install -y wmctrl 2>/dev/null; wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`
- Close browser extension popups before starting recording
- When switching between branches for testing, always rebuild shared package and restart both servers
- The frontend Vite proxy handles /api routing — test via frontend port (3000), not backend port (3001), for realistic E2E testing
- Use `curl` to verify backend endpoints independently before browser testing to catch server-side issues early
- No CI is configured on this repo, so verification is manual
