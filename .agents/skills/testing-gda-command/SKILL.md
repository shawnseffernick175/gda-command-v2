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
  - CAPTURE: Proposal Center, RFP Shredder, Compliance, Proposal Builder, Color Review, Capture Plans
  - INTELLIGENCE: Intel Hub, Predictive, Anomaly Detection, Contacts, Knowledge Base, GovWin IQ
  - REPORTING: Financial Bible (renamed from "Financials" in PR #173), Reports, Charts
  - ADMIN: Settings, Health, Workflows, Doctrine, Book of Truths, Prompts, User Manual
- **Removed features**: Discussions page was removed in PR #173 — no `/discussions` route exists. Do NOT test for it or reference it.
- Financial KPI strip: **sticky header** (position: sticky, top: 0, zIndex: 40) showing **16 KPIs** with "?" info badges on every card. KPIs use both legacy keys (e.g., `orders`, `sales`) and fin-XXX keys (e.g., `fin-001`, `fin-006`). The KPI_INFO map must have entries for both key formats.
- Hidden routes (no sidebar link): Opportunity Detail (`/opportunities/:id`), SAM Monitor (`/sam-monitor`), FPDS Monitor (`/fpds-monitor`)

## Auth System

- **Dev mode** (`AUTH_REQUIRED=false` in `.env`): Auth middleware injects admin user for all requests. Frontend probes `/api/auth/me` on mount, gets 200, renders main app without login.
- **Production mode** (`AUTH_REQUIRED=true`): JWT-based auth enforced on all `/api/*` routes except `/api/auth/*`. Frontend probes `/api/auth/me`, gets 401 if no token, shows Login page.
- **JWT TTL**: Access token expires in **8 hours** (extended from 15m in PR #173). Refresh token: 7 days.
- **Auto-refresh**: Frontend uses coalesced token refresh — multiple concurrent 401s trigger only one refresh call. If refresh fails, user is redirected to `/` (NOT `/login` — the `/login` route does not exist).
- **Auth endpoints**: POST `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/logout`, GET `/api/auth/me`
- **Token storage**: localStorage keys `gda_access_token`, `gda_refresh_token`, `gda_user`
- **Default admin user**: `admin@gda-command.local` — **WARNING**: The seed data uses a placeholder password hash (`$2b$10$placeholder_hash_for_dev`), so login with `admin123` may fail after a fresh `db:reset`. Workaround: register a new user via `POST /api/auth/register` with `{"email":"tester@gda.local","password":"tester123","display_name":"Test User"}`.
- **Production test user**: `tester@gda.local` / `tester123` (registered via API, display name "Devin Tester")
- **Frontend auth gate**: `App.tsx` — `authed` state: `null` = loading spinner, `false` = Login component, `true` = main app
- **Logout**: Sidebar shows username + "Logout" button at bottom

### Auth Testing Procedure

1. **Dev mode bypass**: Start backend with `AUTH_REQUIRED=false`. Navigate to localhost:3000. Verify sidebar + Launchpad render (no login page).
2. **Switch to auth-required**: Restart backend with `AUTH_REQUIRED=true`. Clear localStorage (`localStorage.clear()` in console). Reload page. Verify Login page renders.
3. **Register**: Click "Register" link, fill Display Name/Email/Password, click "Create Account". Verify redirect to Launchpad with username in sidebar.
4. **Logout**: Click "Logout" button in sidebar. Verify return to Login page.
5. **Login**: Enter registered credentials, click "Sign In". Verify redirect to Launchpad with username.
6. **Invalid login**: Enter wrong credentials. Verify red error banner "Invalid email or password".
7. **401 sweep**: After logging in, navigate to Settings, Health, Reports, Knowledge Base, Workflows. Verify NO HTTP 401 errors in console (`performance.getEntriesByType('resource').filter(r => r.responseStatus === 401)` should return empty array).

## Full E2E Audit Pattern (38 items)

When doing a comprehensive audit, navigate every page and verify:
1. **Page loads**: No blank screen, no crash, no unhandled error
2. **Source badge**: Shows "Live API" (n8n data) or "Live DB" (postgres fallback) — NOT "Mock data"
3. **Data state**: Shows real DB data or proper empty state (0 counts, empty message)
4. **No errors**: No console errors, no 500 badges, no broken components
5. **Key feature**: At least one interaction works (filter, tab, button, expand)

### Data Sources

- **n8n integration** (primary): Backend calls n8n webhook at `https://n8n.csr-llc.tech/webhook/gda-opp-tracker` with header `x-gda-key: gda-webhook-secret-2026`. Returns ~301 real opportunities from GovTribe, SAM.gov, GDA Tracker.
- **Postgres fallback**: If n8n is unreachable, backend falls back to local DB (7 seeded opportunities). Source badge shows "Live DB" instead of "Live API".
- Envision Innovative Solutions company profile: $382M revenue (Large Business), 41 employees (Small Business by SBA headcount)
- NAICS Size classification: ~4 Small Business (employee-based NAICS like 541715), ~55 Large Business (revenue-based NAICS), rest Unclassified
- Departments: Agriculture, Commerce, Homeland Security, Justice, Veterans Affairs, War + others

### Navigation Tips

- Use sidebar links for navigation (not address bar) to preserve session/auth state
- For hidden routes without sidebar links, use React router navigation via console:
  `window.history.pushState({}, '', '/route'); window.dispatchEvent(new PopStateEvent('popstate'));`
- Sidebar collapse toggle: click ◀ to collapse to icon-only rail (~52px), click ▶ to expand back

### Complete Page Inventory (33 pages)

| Group | Pages |
|-------|-------|
| Operations (6) | Launchpad `/`, Fast Track `/fast-track`, Ops Tracker `/ops-tracker`, Pipeline `/pipeline`, Approvals `/approvals`, Risk Register `/risk-register` |
| Capture (6) | Proposal Center `/proposal-center`, RFP Shredder `/rfp-shredder`, Compliance `/compliance`, Proposal Builder `/proposals`, Color Review `/color-review`, Capture Plans `/capture` |
| Intelligence (6) | Intel Hub `/intel`, Predictive `/predictive`, Anomaly Detection `/anomaly`, Contacts `/contacts`, Knowledge Base `/knowledge`, GovWin IQ `/govwin` |
| Reporting (3) | Financial Bible `/financial-bible`, Reports `/reports`, Charts `/charts` |
| Admin (9) | Settings `/settings`, Health `/qa-center`, Workflows `/workflows`, Doctrine `/doctrine`, Book of Truths `/book-of-truths`, Prompts `/prompts`, User Manual `/help`, Notifications `/notifications` |
| Hidden (3) | Opportunity Detail `/opportunities/:id`, SAM Monitor `/sam-monitor`, FPDS Monitor `/fpds-monitor` |

### Global Features (5 items)

| Feature | How to test |
|---------|-------------|
| Sidebar collapse | Click ◀ button, verify icon-only rail, click ▶ to expand back |
| Notifications | Click bell icon at bottom of sidebar, verify panel renders |
| Financial KPI strip | Observe top header — shows 16 KPIs with real values, sticky at top when scrolling, "?" info badge on every card |
| 404 page | Navigate to `/nonexistent-page`, verify "Page not found" with Back to Launchpad link |
| QuickEntry FAB | Click floating "+" button (bottom-right). Verify exactly 3 actions: New Opportunity (📡), New Contact (👤), Quick Note (📝). NO Discussion option. Note: the "?" help button may overlap the FAB — use `document.querySelector('button[aria-label="Quick Entry"]').click()` if click doesn't work. |

## Launchpad Testing

### KPI Strip Verification
- **Sticky behavior**: Scroll down the page — KPI strip must remain fixed at viewport top (position: sticky, top: 0, zIndex: 40)
- **All 16 KPIs must have "?" buttons**: Orders, Sales, EBIT, Gross Profit, ROS, Funded Backlog, Contract Backlog, Active Contracts, Annual Revenue, Avg Contract Value, Avg P(Win), Employee Count, Pipeline Value, Proposals Submitted, Revenue Per Employee, Win Rate
- **"Contract Backlog" label** (not "Backlog"): 7th KPI card, backed by `fin-006` in `financial_kpis` table
- **KPI_INFO map**: Must contain entries for both legacy keys (e.g., `backlog`) AND fin-XXX keys (e.g., `fin-006`) since DB returns fin-XXX keys

### Summary Cards Verification
- Cards should show: **Total Opportunities**, **Weighted Op Value**, **Avg Score**, **Avg Pwin**
- NO cards labeled "Pursue", "Evaluate", or "Monitor" (these were removed — they showed misleading n8n classification counts)
- **Avg Pwin** should show "—" (dash) when no pwin data exists, NOT "0%"
- Grid layout: `repeat(4, 1fr)` — 4 cards in a row

## Ops Tracker Testing

### Expired Due Date Badges
- Opportunities with past `due_date` AND active status (discovery, interest, pipeline/pursue) should show:
  - Red text (#ef4444) with font-weight 600
  - "EXPIRED" badge (small red background pill)
- **Won/lost opportunities**: Should NOT show EXPIRED badge even if due_date is in the past (terminal statuses are semantically correct)
- `isExpired()` function at OpsTracker.tsx:47-50 checks `new Date(d).getTime() < Date.now()`
- Guards at lines 645-654 exclude `opp.status !== "won" && opp.status !== "lost"`

## Known Issues

- **Predictive Analytics crash**: `/predictive` might crash with `Cannot read properties of undefined (reading 'overall_win_rate')` when DB returns empty data. Frontend might not handle undefined response.
- **System DATABASE_URL override**: The VM might have a system-level `DATABASE_URL` env var (e.g., pointing to n8n's postgres). Always start backend with explicit `DATABASE_URL=...`.
- **Admin login may fail after db:reset**: Seed data uses placeholder password hash. Register a new user via API as workaround.
- **Financial KPI strip**: Shows "unavailable" when no financial data is seeded — this is expected behavior, not a bug.
- **QuickEntry FAB overlap**: The "?" (Ask a Question) button may visually overlap the QuickEntry "+" FAB at bottom-right. Use JavaScript click as workaround: `document.querySelector('button[aria-label="Quick Entry"]').click()`
- **Workflows page**: Shows "Workflow Engine Unavailable" when n8n is not running — this is expected in dev, not a bug.

## Mock Data & Migration Gotchas

### Migration ID Patterns
When writing migrations to delete seeded/mock data, always verify the actual ID patterns in the database first. Previous migration (027) failed because it used wrong patterns:

| Table | Wrong Pattern | Correct Pattern |
|-------|--------------|----------------|
| morning_briefings | `briefing-%` | `brief-%` |
| doctrine_drafts | `doctrine-%` | `dd-%` |
| contacts | `contact-%` | `CON-%` |
| approvals | `approval-%` | `APR-%` |
| capture_plans | `capture-%` | `cap-%` |
| generated_reports | `report-%` | `RPT-%` |
| report_templates | `template-%` | `TPL-%` |
| scheduled_reports | `schedule-%` | `SCH-%` |
| compliance_requirements | `compliance-%` | `CR-%` |

**Always query the DB first**: `SELECT id FROM <table> LIMIT 5;` to see actual ID patterns before writing DELETE statements.

### FK Constraints
- `generated_reports` has a FK to `report_templates` — must delete generated_reports FIRST
- Track applied migrations in `schema_migrations` table (id, name, applied_at)

## OODA Analysis & NAICS Scoring Testing

### Overview
The OODA Analysis feature runs AI analysis on opportunities. As of PR #169, NAICS scoring is **deterministic** — the `scoreNaicsMatch()` function compares the opportunity's NAICS code against the company's registered codes before the LLM runs, and injects the pre-computed score into the prompt.

### Company's Registered NAICS Codes
`541512, 541519, 541611, 541715, 541330, 541990, 518210, 561611`

These are hardcoded in `packages/backend/src/agents/opportunity-watch.ts` in the `COMPANY_NAICS` array.

### NAICS Scoring Tiers
| Match Level | Score | Banner Color | canBidAsPrime |
|-------------|-------|-------------|---------------|
| exact | 20/20 | Green | Yes |
| prefix_5 (first 5 digits match) | 12/20 | Yellow | Yes |
| prefix_4 (first 4 digits match) | 8/20 | Yellow | Yes |
| sector (first 2 digits match) | 3/20 | Yellow | No |
| none | 0/20 | Red | No |

### How to Test NAICS Scoring

1. **Find or create test data**: You need at least two opportunities — one with a NAICS code in the company's list (e.g., 541512) and one with a non-matching NAICS (e.g., 611430).
   - To update an opportunity's NAICS in the DB: `UPDATE opportunities SET naics = '541512' WHERE id = '666';`
   - Use `docker exec gda-postgres psql -U gda -d gda_command -c "..."` for local, or SSH into VPS for production.

2. **Navigate to Opportunity Detail**: `/opportunities/<id>`

3. **Click "Run AI Analysis" or "Re-analyze"**: This triggers the backend OODA analysis which includes deterministic NAICS scoring. The button shows "Analyzing..." while running (~15-30 seconds for LLM call).

4. **Verify NAICS Match Banner**: After analysis completes, a banner appears above the Observe section:
   - **Matching NAICS**: Green background, checkmark emoji, "NAICS Match — <code>", "20/20 pts", explanation like "Exact NAICS match: company is registered under <code>"
   - **Non-matching NAICS**: Red background, X emoji, "NAICS Mismatch — <code>", "0/20 pts", explanation listing all registered codes and "Cannot bid as prime"

5. **Verify Orient Section**: Scroll to "Orient — What It Means" section:
   - Matching: "NAICS Alignment" with green "strength" badge
   - Non-matching: "NAICS Alignment" with red "risk" badge

6. **Verify Score Impact**: The overall Pwin score should be higher for matching NAICS than non-matching. In testing, a matching NAICS opp scored 75 vs 45 for non-matching (30-point difference from NAICS component alone).

### NAICS Testing Gotchas
- **Analysis takes 15-30 seconds**: The LLM call is not instant. Wait for the "Analyzing..." button to change back to "Re-analyze" and the page to refresh.
- **Existing analysis may cache**: If an opportunity already has OODA data from before the NAICS feature, click "Re-analyze" to trigger a fresh analysis with the new deterministic scoring.
- **LLM may not always perfectly follow NAICS score injection**: The prompt instructs the LLM to use the pre-computed NAICS score exactly, but verify the banner (which uses the deterministic result directly) rather than relying on the LLM's text description alone.
- **Banner data comes from `naics_match` field in OODA JSON**: The frontend reads `rawOoda.naics_match` to render the banner. If no `naics_match` key exists in the stored OODA data, no banner shows.

## Production Testing

### Production Verification Workflow
```bash
# Login and get token
export TOKEN=$(curl -s -X POST "https://gda.csr-llc.tech/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"tester@gda.local","password":"tester123"}' \
  | jq -r '.data.accessToken')

# Get opportunities
curl -s "https://gda.csr-llc.tech/api/opportunities?page=1&pageSize=25" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '{source: .meta.source, count: .meta.totalFiltered, totalPages: .meta.totalPages, totalValue: .meta.totalValue}'
# Expected: {source: "gateway", count: ~302, totalPages: 13, totalValue: ~2303223583}
```

### Production Deploy
- VPS: `sshpass -p "${HOSTINGER_VPS_PASSWORD}" ssh root@${HOSTINGER_VPS_IP}` (or `ssh root@187.77.206.105`)
- Deploy compose file: **`docker-compose.prod.yml`** (NOT `docker-compose.yml` which is dev-only postgres, NOT `docker-compose.deploy.yml`)
- Container names: **`gda-backend`**, **`gda-frontend`**, **`gda-postgres`** (NOT `gda-v2-*` prefixed)
- Pull latest: `cd /root/gda-command-v2 && git pull origin main`
- Rebuild: `docker compose -f docker-compose.prod.yml build --no-cache backend frontend`
- Restart: `docker compose -f docker-compose.prod.yml up -d backend frontend`
- **NEVER use `-v` flag** with `docker compose down` — this deletes the postgres volume and wipes all user data
- Run migrations: `docker exec gda-backend node -e "require('./dist/db/migrate').migrate()"`
- Verify: `docker ps --format 'table {{.Names}}\t{{.Status}}' | grep gda`
- Site: https://gda.csr-llc.tech
- **Production login**: `tester@gda.local` / `tester123` (display: "Devin Tester")

### Migration Testing
- **Column names matter**: The `financial_kpis` table uses `id` column (NOT `key`). Migration 023 was initially wrong with `WHERE key = 'backlog'` — fixed to `WHERE id = 'fin-006'`.
- **Always verify migrations on production**: After deploy, run migration command and check for errors. Then verify the data change in the UI.
- **Test migration idempotency**: Running the same migration twice should not error (use `IF NOT EXISTS`, `ON CONFLICT`, or conditional updates).
- **Verify ID patterns before writing DELETEs**: Query the actual table to see real IDs. Don't guess patterns from table/column names.

### Browser Testing Tips
- Pagination buttons may be below the fold — scroll down to expose them
- Use `document.querySelectorAll('button')` with text matching to reliably click pagination buttons
- When verifying summary stats across pages, compare Count + Total Value on page 1 vs page 2 — they must be identical
- n8n source badge text: "Live API" (green chip) — if you see "Live DB", n8n connection failed
- **KPI strip scrolls horizontally** — not all 16 KPIs are visible at once. Use DOM inspection to verify offscreen KPIs have "?" buttons.
- **Console 401 check**: Use `performance.getEntriesByType('resource').filter(r => r.responseStatus === 401)` to programmatically verify no 401 errors on any page.

## Devin Secrets Needed

- `HOSTINGER_VPS_PASSWORD` — for SSH access to production VPS (used in deploy commands)
- `HOSTINGER_VPS_IP` — production VPS IP address
- No other secrets needed for testing. Auth uses local JWT with dev secret.
