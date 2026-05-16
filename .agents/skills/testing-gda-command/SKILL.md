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
- Financial KPI strip: **sticky header** (position: sticky, top: 0, zIndex: 40) showing **16 KPIs** with "?" info badges on every card. KPIs use both legacy keys (e.g., `orders`, `sales`) and fin-XXX keys (e.g., `fin-001`, `fin-006`). The KPI_INFO map must have entries for both key formats.
- Hidden routes (no sidebar link): Opportunity Detail (`/opportunities/:id`), SAM Monitor (`/sam-monitor`), FPDS Monitor (`/fpds-monitor`)

## Auth System

- **Dev mode** (`AUTH_REQUIRED=false` in `.env`): Auth middleware injects admin user for all requests. Frontend probes `/api/auth/me` on mount, gets 200, renders main app without login.
- **Production mode** (`AUTH_REQUIRED=true`): JWT-based auth enforced on all `/api/*` routes except `/api/auth/*`. Frontend probes `/api/auth/me`, gets 401 if no token, shows Login page.
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
| Financial KPI strip | Observe top header — shows 16 KPIs with real values, sticky at top when scrolling, "?" info badge on every card |
| 404 page | Navigate to `/nonexistent-page`, verify "Page not found" with Back to Launchpad link |

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

## Known Issues

- **Predictive Analytics crash**: `/predictive` might crash with `Cannot read properties of undefined (reading 'overall_win_rate')` when DB returns empty data. Frontend might not handle undefined response.
- **System DATABASE_URL override**: The VM might have a system-level `DATABASE_URL` env var (e.g., pointing to n8n's postgres). Always start backend with explicit `DATABASE_URL=...`.
- **Admin login may fail after db:reset**: Seed data uses placeholder password hash. Register a new user via API as workaround.
- **Financial KPI strip**: Shows "unavailable" when no financial data is seeded — this is expected behavior, not a bug.
- **n8n values arrive as strings**: All numeric fields from n8n (value_estimated, score, probability_of_win) must be coerced with `Number()` or `parseFloat()` before arithmetic. Without coercion, `reduce()` concatenates strings instead of summing (e.g., "5000000" + "3000000" = "050000003000000").

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
4. **Test NAICS Size filter** on Ops Tracker: All≈302, Small≈varies, Large≈varies
5. **Test filters and tabs** — click each, verify content renders
6. **Record browser interactions** with annotate_recording tool
7. **For POST writes** — curl POST → psql verify → GET verify → UI verify (4-step pattern)

## Ops Tracker Testing (n8n Integration)

### Pagination
- Default: 25 per page, `page=1&pageSize=25` query params
- Expected: ~13 pages for ~302 opportunities
- Pagination controls: Prev/Next buttons + "Page X of Y — showing Z of N opportunities"
- **Summary strip must show full-dataset aggregates** (Count≈302, Total Value≈$2.3B), NOT page-slice values
- **Summary stats must NOT change when paginating** — only the table data changes
- **Total Value formatting**: Must show clean abbreviations like "$2.3B" or "$6.0M", NOT raw numbers like "$23032235831.0M" or scientific notation

### API Verification
```bash
# Login (production)
TOKEN=$(curl -s https://gda.csr-llc.tech/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"tester@gda.local","password":"tester123"}' \
  | jq -r '.data.accessToken')

# Test pagination
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
- Run migrations: `docker exec gda-backend node -e "require('./dist/db/migrate').migrate()"`
- Verify: `docker ps --format 'table {{.Names}}\t{{.Status}}' | grep gda`
- Site: https://gda.csr-llc.tech
- **Production login**: `tester@gda.local` / `tester123` (display: "Devin Tester")

### Migration Testing
- **Column names matter**: The `financial_kpis` table uses `id` column (NOT `key`). Migration 023 was initially wrong with `WHERE key = 'backlog'` — fixed to `WHERE id = 'fin-006'`.
- **Always verify migrations on production**: After deploy, run migration command and check for errors. Then verify the data change in the UI.
- **Test migration idempotency**: Running the same migration twice should not error (use `IF NOT EXISTS`, `ON CONFLICT`, or conditional updates).

### Browser Testing Tips
- Pagination buttons may be below the fold — scroll down to expose them
- Use `document.querySelectorAll('button')` with text matching to reliably click pagination buttons
- When verifying summary stats across pages, compare Count + Total Value on page 1 vs page 2 — they must be identical
- n8n source badge text: "Live API" (green chip) — if you see "Live DB", n8n connection failed
- **KPI strip scrolls horizontally** — not all 16 KPIs are visible at once. Use DOM inspection to verify offscreen KPIs have "?" buttons.

## Devin Secrets Needed

- `HOSTINGER_VPS_PASSWORD` — for SSH access to production VPS (used in deploy commands)
- `HOSTINGER_VPS_IP` — production VPS IP address
- No other secrets needed for testing. Auth uses local JWT with dev secret.
