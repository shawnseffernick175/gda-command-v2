---
name: testing-gda-command
description: Test GDA Command v2 end-to-end. Use when verifying UI pages, API endpoints, or new milestone features.
---

# Testing GDA Command v2

## Environment Setup

1. **PostgreSQL**: `docker compose up -d` from repo root → starts `gda-postgres` container on port 5432
   - Verify: `docker ps --format '{{.Names}} {{.Status}}'` should show `gda-postgres Up ... (healthy)`
   - Connection: `postgresql://gda:gda_dev_password@localhost:5432/gda_command`
   - **IMPORTANT**: The VM may have a system-level `DATABASE_URL` env var pointing to a different database (e.g., n8n). Always start the backend with explicit override: `DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command npm run dev`
2. **Database migrations**: `cd packages/backend && npm run db:migrate` (runs SQL migrations)
3. **Database seed**: `cd packages/backend && npm run db:seed` (populates 7 opportunities + 1 test user)
4. **Database reset**: `cd packages/backend && npm run db:reset` (drops all, re-migrates, re-seeds)
5. Backend: `cd packages/backend && DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command npm run dev` → runs on port 3001
6. Frontend: `cd packages/frontend && npm run dev` → runs on port 3000
7. If ports are occupied, kill old processes: `fuser -k 3001/tcp; fuser -k 3000/tcp`
8. Frontend proxies `/api/*` to backend via Vite config
9. No CI configured — repo has no automated checks

## Architecture

- Monorepo: `packages/backend`, `packages/frontend`, `packages/shared`
- Backend: Express + TypeScript, live DB data (all mock fallbacks removed as of PR #96)
- Frontend: React + TypeScript + Vite, pages in `packages/frontend/src/pages/`
- Shared types: `packages/shared/src/index.ts`
- All API responses use `successEnvelope(workflow, action, data, meta, dryRun)` wrapper
- Navigation: 5-group collapsible sidebar (220px expanded / 52px collapsed)
  - OPERATIONS: Launchpad, Fast Track, Ops Tracker, Pipeline, Approvals, Risk Register
  - CAPTURE: Capture Plans, Proposals, RFP Shredder, Compliance, Color Review
  - INTELLIGENCE: Intel Hub, Predictive, Anomaly Detection, Contacts, Knowledge Base, CPARS Builder, GovWin IQ
  - REPORTING: Financials, Reports, Charts, Discussions
  - ADMIN: Settings, Health, Workflows, Users, Audit Log, Doctrine, Book of Truths, Prompts, User Manual
- Financial KPI strip: persistent header showing 16 KPIs (Orders, Sales, EBIT, Gross Profit, ROS, etc.)
  - Each KPI with a "?" button has an InfoBadge tooltip with "What it is", "What it means", "How it's calculated"
  - KPI cards are `<div>` elements (not `<a>` links) — clicking them should NOT navigate
- Hidden routes (no sidebar link): Opportunity Detail (`/opportunities/:id`), SAM Monitor (`/sam-monitor`), FPDS Monitor (`/fpds-monitor`)

## Auth System

- **Dev mode** (`AUTH_REQUIRED=false` in `.env`): Auth middleware injects admin user for all requests. Frontend probes `/api/auth/me` on mount, gets 200, renders main app without login.
- **Production mode** (`AUTH_REQUIRED=true`): JWT-based auth enforced on all `/api/*` routes except `/api/auth/*`. Frontend probes `/api/auth/me`, gets 401 if no token, shows Login page.
- **Auth endpoints**: POST `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/logout`, GET `/api/auth/me`
- **Token storage**: localStorage keys `gda_access_token`, `gda_refresh_token`, `gda_user`
- **Default admin user**: `admin@gda-command.local` — **WARNING**: The seed data uses a placeholder password hash (`$2b$10$placeholder_hash_for_dev`), so login with `admin123` may fail after a fresh `db:reset`. Workaround: register a new user via `POST /api/auth/register` with `{"email":"tester@gda.local","password":"tester123","display_name":"Test User"}`.
- **Frontend auth gate**: `App.tsx` — `authed` state: `null` = loading spinner, `false` = Login component, `true` = main app
- **Logout**: Sidebar shows username + "Logout" button at bottom

### Auth Testing Procedure

1. **Dev mode bypass**: Start backend with `AUTH_REQUIRED=false`. Navigate to localhost:3000. Verify sidebar + Launchpad render (no login page).
2. **Switch to auth-required**: Restart backend with `AUTH_REQUIRED=true`. Clear localStorage (`localStorage.clear()` in console). Reload page. Verify Login page renders.
3. **Register**: Click "Register" link, fill Display Name/Email/Password, click "Create Account". Verify redirect to Launchpad with username in sidebar.
4. **Logout**: Click "Logout" button in sidebar. Verify return to Login page.
5. **Login**: Enter registered credentials, click "Sign In". Verify redirect to Launchpad with username.
6. **Invalid login**: Enter wrong credentials. Verify red error banner "Invalid email or password".

## Full E2E Audit Pattern (38 items)

When doing a comprehensive audit, navigate every page and verify:
1. **Page loads**: No blank screen, no crash, no unhandled error
2. **Source badge**: Shows "Live API" (n8n data) or "Live DB" (postgres fallback) — NOT "Mock data"
3. **Data state**: Shows real DB data or proper empty state (0 counts, empty message)
4. **No errors**: No console errors, no 500 badges, no broken components
5. **Key feature**: At least one interaction works (filter, tab, button, expand)

### Data Sources

- **n8n integration** (primary): Backend calls n8n webhook at `https://n8n.csr-llc.tech/webhook/gda-opp-tracker` with header `x-gda-key: gda-webhook-secret-2026`. Returns ~302 real opportunities from GovTribe, SAM.gov, GDA Tracker.
- **Postgres fallback**: If n8n is unreachable, backend falls back to local DB. Source badge shows "Live DB" instead of "Live API".
- **Pipeline data source**: Pipeline endpoint reads ONLY from Postgres (`approved_at IS NOT NULL`). n8n webhook was removed because it bypassed the approval gate. Source badge always shows "Live DB".
- Envision Innovative Solutions company profile: $382M revenue (Large Business), 41 employees (Small Business by SBA headcount)
- NAICS Size classification: ~4 Small Business (employee-based NAICS like 541715), ~55 Large Business (revenue-based NAICS), rest Unclassified
- Departments: Agriculture, Commerce, Homeland Security, Justice, Veterans Affairs, War + others

### Navigation Tips

- Use sidebar links for navigation (not address bar) to preserve session/auth state
- For hidden routes without sidebar links, use React router navigation via console:
  `window.history.pushState({}, '', '/route'); window.dispatchEvent(new PopStateEvent('popstate'));`
- Sidebar collapse toggle: click ◀ to collapse to icon-only rail (~52px), click ▶ to expand back

### Complete Page Inventory (34 pages)

| Group | Pages |
|-------|-------|
| Operations (6) | Launchpad `/`, Fast Track `/fast-track`, Ops Tracker `/ops-tracker`, Pipeline `/pipeline`, Approvals `/approvals`, Risk Register `/risk-register` |
| Capture (5) | Capture Plans `/capture`, Proposals `/proposals`, RFP Shredder `/rfp-shredder`, Compliance `/compliance`, Color Review `/color-review` |
| Intelligence (7) | Intel Hub `/intel`, Predictive `/predictive`, Anomaly Detection `/anomaly`, Contacts `/contacts`, Knowledge Base `/knowledge`, CPARS Builder `/cpars`, GovWin IQ `/govwin` |
| Reporting (4) | Financials `/financial-bible`, Reports `/reports`, Charts `/charts`, Discussions `/discussions` |
| Admin (9) | Settings `/settings`, Health `/qa-center`, Workflows `/workflows`, Users `/admin/users`, Audit Log `/admin/audit`, Doctrine `/doctrine`, Book of Truths `/book-of-truths`, Prompts `/prompts`, User Manual `/help` |
| Hidden (3) | Opportunity Detail `/opportunities/:id`, SAM Monitor `/sam-monitor`, FPDS Monitor `/fpds-monitor` |

### Global Features (4 items)

| Feature | How to test |
|---------|-------------|
| Sidebar collapse | Click ◀ button, verify icon-only rail, click ▶ to expand back |
| Notifications | Click bell icon at bottom of sidebar, verify panel renders |
| Financial KPI strip | Observe top header — shows 16 KPIs with real values when data is seeded |
| 404 page | Navigate to `/nonexistent-page`, verify "Page not found" with Back to Launchpad link |

## Known Issues

- **Predictive Analytics crash**: `/predictive` might crash with `Cannot read properties of undefined (reading 'overall_win_rate')` when DB returns empty data. Frontend may not handle undefined response after mock data removal.
- **FPDS Monitor calculation errors**: `/fpds-monitor` might load 500 awards but Total Value shows "$NaN" and Avg Relevance shows "null%" — data parsing issue in aggregate calculations.
- **System DATABASE_URL override**: The VM might have a system-level `DATABASE_URL` env var (e.g., pointing to n8n's postgres). Always start backend with explicit `DATABASE_URL=...`.
- **Admin login may fail after db:reset**: Seed data uses placeholder password hash. Register a new user via API as workaround.
- **Financial KPI strip**: Shows "unavailable" when no financial data is seeded — this is expected behavior, not a bug.

## POST Write Persistence Testing

For testing endpoints that write to PostgreSQL:

1. **Reset DB to clean state**: `cd packages/backend && npm run db:reset`
2. **Record initial state**: `docker exec gda-postgres psql -U gda -d gda_command -c "SELECT id, status FROM <table> WHERE id='<id>'"`
3. **Call POST endpoint**: `curl -s -X POST http://localhost:3001/api/<endpoint> -H 'Content-Type: application/json' -d '{...}'`
4. **Verify API response**: Check `success: true`, `dryRun: false` (not `true`), and returned data matches expected
5. **Verify DB persistence**: `docker exec gda-postgres psql -U gda -d gda_command -c "SELECT ... FROM <table> WHERE ..."`
6. **Verify UI renders updated data**: Navigate to the page in browser and confirm the change is visible

### POST Endpoints with Real DB Writes

| Route | Endpoint | DB Operation |
|-------|----------|-------------|
| approvals | `POST /:id/resolve` | UPDATE approvals status/resolved_by/at/notes |
| anomaly | `POST /anomalies/:id/acknowledge` | UPDATE status + acknowledged_at |
| anomaly | `POST /anomalies/:id/resolve` | UPDATE status + resolved_at |
| discussions | `POST /threads` | INSERT discussion_threads |
| discussions | `POST /threads/:id/messages` | INSERT message + UPDATE thread count |
| doctrine | `POST /finalize` | UPDATE drafts + INSERT publish run |
| sam-monitor | `POST /opportunities/:id/qualify` | UPDATE scan_status |
| reports | `POST /generate` | INSERT generated_reports |
| reports | `POST /export` | INSERT export_jobs |
| capture | `POST /gate-review` | UPDATE gate_reviews JSONB |

## Testing Strategy

1. **Navigate systematically** through all sidebar groups
2. **Verify source badges** — "Live API" means n8n data (preferred), "Live DB" means postgres fallback
3. **Check empty states** — pages with no DB data should show 0 counts + empty message (NOT mock data)
4. **Test NAICS Size filter** on Ops Tracker: All=302, Small≈varies, Large≈varies, Unclassified≈varies
5. **Test filters and tabs** — click each, verify content renders
6. **Record browser interactions** with annotate_recording tool
7. **For POST writes** — curl POST → psql verify → GET verify → UI verify (4-step pattern)

## Stage Enforcement Testing

**Critical rule**: ALL opportunities must default to "Interest" (discovery status). Only the user can change them via the Approvals queue. No automated process should change stages.

### Pipeline Approval Gate

1. Navigate to `/pipeline`
2. Verify source badge shows **"Live DB"** (green) — NOT "Live API"
3. Verify Total Pipeline count is **0** (unless user has explicitly approved opportunities)
4. Verify message: "No approved opportunities in the pipeline yet. Approve opportunities from the Approvals queue to see them here."
5. The Pipeline endpoint reads only from Postgres with `WHERE approved_at IS NOT NULL`. n8n webhook was removed because it returned all opportunities as "Qualified" regardless of user approval.

### Ops Tracker Stage Verification

1. Navigate to `/ops-tracker`
2. For each visible row, verify the status dropdown shows **"Interest"** (selectedindex=0)
3. Specifically check IDs 666 (C2 Digital) and 696 (Cyber Training) — these were previously auto-changed
4. No opportunity should show "Qualify", "Lost", or any other non-Interest status unless the user explicitly changed it

### KPI Info Button ("?") Testing

1. Navigate to any page with the KPI strip header (e.g., `/ops-tracker`)
2. Note the current URL
3. Click the "?" button next to any KPI label (e.g., "Orders")
4. Verify:
   - URL does NOT change (should NOT navigate to `/financial-bible/...`)
   - A tooltip popover appears with sections: "What it is", "What it means", "How it's calculated"
   - The button is 20px (not 12px) — large enough to click without hitting the parent div
5. KPI cards are `<div>` elements, not `<a>` links — clicking them should never navigate

## Ops Tracker Testing (n8n Integration)

### Pagination
- Default: 25 per page, `page=1&pageSize=25` query params
- Expected: ~13 pages for 302 opportunities (ceil(302/25) = 13)
- Pagination controls: Prev/Next buttons + "Page X of Y — showing Z of N opportunities"
- **Summary strip must show full-dataset aggregates** (Count=302, Total Value≈$23B), NOT page-slice values
- **Summary stats must NOT change when paginating** — only the table data changes

### API Verification
```bash
# Login
TOKEN=$(curl -s https://gda.csr-llc.tech/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"shawn.seffernick@envision-is.com","password":"admin123"}' \
  | jq -r '.data.accessToken')

# Test pagination
curl -s "https://gda.csr-llc.tech/api/opportunities?page=1&pageSize=25" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '{source: .meta.source, count: .meta.totalFiltered, totalPages: .meta.totalPages, totalValue: .meta.totalValue}'
# Expected: {source: "gateway", count: ~302, totalPages: ~13}
```

### Production Deploy
- VPS: `ssh root@187.77.206.105`
- Deploy compose file: `docker-compose.prod.yml` (NOT `docker-compose.yml` which is dev-only postgres)
- Services: frontend, backend, postgres
- Rebuild: `docker compose -f docker-compose.prod.yml up -d --build backend frontend`
- Verify: `docker ps --format 'table {{.Names}}\t{{.Status}}' | grep gda`
- Site: https://gda.csr-llc.tech
- Login: `shawn.seffernick@envision-is.com` / `admin123`
- **Traefik**: Uses `mytlschallenge` cert resolver (NOT `letsencrypt`). Frontend needs `traefik.docker.network` label.

### Browser Testing Tips
- **Browser cache warning**: After deploying code changes, the browser may serve stale cached JavaScript. Always do a hard refresh (Ctrl+Shift+R) or use a fresh login/incognito window after production deploys.
- Pagination buttons may be below the fold — scroll down to expose them
- Use `document.querySelectorAll('button')` with text matching to reliably click pagination buttons
- When verifying summary stats across pages, compare Count + Total Value on page 1 vs page 2 — they must be identical
- n8n source badge text: "Live API" (green chip) — if you see "Live DB", n8n connection might have failed
- Pipeline source badge: always "Live DB" (green) — this is correct; Pipeline reads only from Postgres
- When using Playwright for fresh login testing, intercept API responses to verify backend returns correct data shape independently of browser rendering

## Devin Secrets Needed

None — all live DB data, no external services required for testing. Auth uses local JWT with dev secret.
