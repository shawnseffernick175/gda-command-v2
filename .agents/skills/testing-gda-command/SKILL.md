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
3. **Database seed**: `cd packages/backend && npm run db:seed` (populates 300+ records from mock data)
4. **Database reset**: `cd packages/backend && npm run db:reset` (drops all, re-migrates, re-seeds)
5. Backend: `cd packages/backend && DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command npm run dev` → runs on port 3001
6. Frontend: `cd packages/frontend && npm run dev` → runs on port 3000
7. If ports are occupied, kill old processes: `fuser -k 3001/tcp; fuser -k 3000/tcp`
8. Frontend proxies `/api/*` to backend via Vite config
9. No CI configured — repo has no automated checks

## Architecture

- Monorepo: `packages/backend`, `packages/frontend`, `packages/shared`
- Backend: Express + TypeScript, mock data in `packages/backend/src/data/`
- Frontend: React + TypeScript + Vite, pages in `packages/frontend/src/pages/`
- Shared types: `packages/shared/src/index.ts`
- All API responses use `successEnvelope(workflow, action, data, meta, dryRun)` wrapper
- Navigation: Collapsible sidebar (220px expanded / 52px collapsed)
  - BD Tools: Launchpad, Fast Track, Ops Tracker, Pipeline, Capture, Approvals, RFP Shredder, SAM.gov Monitor, FPDS Monitor
  - Analysis: Intel Hub, Compliance, Proposals, Contacts, Financials, Reports, Knowledge, Predictive, Color Review, Anomaly Detection, CPARS Builder
  - Collaboration: Discussions
  - Platform: QA Center, Doctrine, Prompts, Workflows, Settings
- Financial KPI strip: persistent header with Orders/Sales/EBIT/ROS/Backlog/Gross Profit
  - May not render on initial load due to fetch race condition — hard reload fixes it

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

## Testing Pattern

For each new page:
1. Compute exact expected values from mock data files before testing
2. Use `npx tsx -e "import { MOCK_DATA } from './path'; console.log(...)"` to extract values programmatically
3. Navigate to the page, verify summary strip KPIs match computed values
4. Click through detail panels and tabs, verify data renders correctly
5. Test filters (dropdowns, search) — verify exact result counts
6. Test Launchpad card navigation back to the page
7. Record browser interactions with annotate_recording tool

## POST Write Persistence Testing

For testing endpoints that write to PostgreSQL (Phase 1c+):

1. **Reset DB to clean state**: `cd packages/backend && npm run db:reset`
2. **Record initial state**: `docker exec gda-postgres psql -U gda -d gda_command -c "SELECT id, status FROM <table> WHERE id='<id>'"`
3. **Call POST endpoint**: `curl -s -X POST http://localhost:3001/api/<endpoint> -H 'Content-Type: application/json' -d '{...}'`
4. **Verify API response**: Check `success: true`, `dryRun: false` (not `true`), and returned data matches expected
5. **Verify DB persistence**: `docker exec gda-postgres psql -U gda -d gda_command -c "SELECT ... FROM <table> WHERE ..."`
6. **Verify UI renders updated data**: Navigate to the page in browser and confirm the change is visible

### POST Endpoints with Real DB Writes

| Route | Endpoint | DB Operation |
|-------|----------|--------------|
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

### Key Gotchas for Write Testing

- **Template IDs are case-sensitive**: Use `TPL-001` not `tpl-001` for report generation
- **Auth header may be required**: If `AUTH_REQUIRED=true`, include `Authorization: Bearer <token>` in curl requests. If `AUTH_REQUIRED=false`, the dev middleware injects admin user automatically.
- **Verify `dryRun: false`**: If response shows `dryRun: true`, the write did NOT go to DB — it fell back to mock.
- **New discussion threads may show "NaNd ago"**: The relative timestamp display might not parse ISO timestamps from newly created threads correctly. This is a cosmetic issue — data persists correctly.

## Page-Specific Testing Data

### Color Review (`/color-review`)
- **Mock data**: 15 ColorReview objects in `color-review-mock.ts` (White=3, Pink=4, Green=3, Red=3, Gold=2)
- **Summary strip**: Reviews=15, White=3, Pink=4, Green=3, Red=3, Gold=2, Avg Score=76%, Proposals=6, GO/Cond/No-Go=0/1/1
- **5 phases**: White (#94a3b8), Pink (#ec4899), Green (#22c55e), Red (#ef4444), Gold (#eab308)
- **Phase-specific tabs**:
  - Pink: Compliance (pass/fail/warn checks with suggestions)
  - Red: Sections (scored 0-100 with strengths/weaknesses)
  - Gold: Gold Checks (go/no-go with confidence %)
  - Green: Cost Items (proposed/gov estimate/variance/BOE), Green Checks (benchmarks/recommendations)
  - White: Format Checks (expected vs actual, volume tags)
- **Key mock reviews**: CR-010 (Green, 76%, 6 cost items $101.7M), CR-014 (White, 63%, 3 FAIL format checks)
- **API**: GET /api/color-review, GET /api/color-review/:id, POST /api/color-review/run (dry-run)

### Anomaly Detection (`/anomaly`)
- **Mock data**: 12 anomalies, 10 competitor movements, 8 escalations, 8 rules in `anomaly-mock.ts`
- **Summary strip**: Anomalies=12, Active=7, Critical=2, High=4, Movements=10, Competitors=9, Escalations=8, Overdue=2
- **4 tabs**: Anomalies (12), Competitor Movements (10), Escalations (8), Rules (8)
- **ANO-001** (Pwin Drop, critical): metric_value=0.54 → displayed as "54%", baseline=0.72 → "72%", deviation=-25.0%, 5 trend sparkline points, 4 recommended actions, root cause starts with "Competitor teaming announcement"
- **CM-001** (AECOM, Teaming Announcement): threat_level="critical" (red), verified=true (green badge), source="SAM.gov Teaming Registration" with clickable link, affected opp "opp-001"
- **ESC-002**: priority="critical", status="overdue", days_overdue=1 → "1d overdue" in red, assigned_to="Mike Torres"
- **ESC-008**: status="resolved", resolution_notes renders in green section: "Registered for industry day May 15..."
- **Critical filter**: Exactly 2 results (ANO-001, ANO-006), shows "2 of 12"
- **Rules tab**: 8 rules (ER-001–ER-008), monospace condition text, priority pills (2 critical, 5 warning, 1 info)
- **API**: GET /api/anomaly/anomalies, GET /api/anomaly/competitor-movements, GET /api/anomaly/escalations, GET /api/anomaly/escalation-rules

### Predictive Analytics (`/predictive`)
- **Mock data**: 6 opportunities, 147-opp historical analysis
- **Summary strip**: Opps=6, Win Rate=42%, Weighted=$68.2M, P50=$68.2M, Gap=$16.8M, Bid=3, Accuracy=87%
- **4 tabs**: ML Pwin Models (8-feature importance), Revenue Forecast (Monte Carlo P10/P50/P90), Bid/No-Bid Optimizer (3 bid/2 watch/1 no-bid), Win/Loss Patterns (8 patterns)
- **Bug fix verified**: Negative currency formatting (-$24.6M not $-24600000)

### RFP Shredder (`/rfp-shredder`)
- **Mock data**: 4 shred jobs, 42 requirements, compliance map, response outline
- **Summary strip**: Jobs=4, Requirements=42, Coverage=77%, Sections=13, Pages=94
- **4 tabs**: Requirements (expandable with SHALL/MUST keywords), Compliance Map, Response Outline, Job History

### Knowledge Base (`/knowledge`)
- **Mock data**: 30 documents across 6 collections
- **Summary strip**: Documents=30, Indexed=29, Processing=1, Chunks=1427, Collections=6, Lookups=810
- **4 tabs**: Documents (split-view), Semantic Search, Collections (grid), RAG Chat (with source citations)
- **PFAS search**: 10 results, top at ~81%
- **Chat session**: 3 sources with page numbers (p7/96%, p4/91%, p23/89%)

### Fast Track (`/fast-track`)
- **Mock data**: 10 match candidates across 7 signal types
- **Summary strip**: New=4, Reviewing=2, Watching=2, Promoted=1, Discarded=1, NeedsAttention=5, Total=10
- **3 tabs**: Overview (contract path hypothesis), OODA (Observe/Orient/Decide/Act), Sources (traceable)
- **Sort**: By match_score descending (FT-008 score=91 first)

### Other Pages
- Ops Tracker (`/ops-tracker`): Smart recommendations panel (8 cards). Main table may show HTTP 500 (n8n timeout, mock fallback not firing) — pre-existing issue.
- Capture Planner (`/capture`): Intel Modules tab (7 modules)
- Opportunity Detail (`/opportunities/:id`): Pwin breakdown, incumbent, competitors, black hat, wargame
- Global Search: Search bar in sidebar, returns results with relevance scores
- Notifications: Bell icon with unread badge, 8 alerts
- Sidebar Navigation: 3 groups — BD Tools (9), Analysis (11), Collaboration (1), Platform (5). Collapse toggle: 220px expanded / 52px collapsed icons-only rail with tooltips.

## Common Issues

- **System DATABASE_URL override**: The VM might have a system-level `DATABASE_URL` env var (e.g., pointing to n8n's postgres). Always start backend with explicit `DATABASE_URL=...` to avoid connecting to the wrong database.
- **Backend crash on DB failure**: Some auth endpoints (e.g., `/me` at `auth.ts:221`) might lack try/catch around `pool.query()`. If DB connection fails, the backend process may crash with unhandled promise rejection.
- Financial KPI strip may not render on first load — the component returns null when kpis array is empty due to fetch race. Hard reload fixes it.
- Ops Tracker main table may show 500 error — n8n connection timeout, mock fallback doesn't fire for that endpoint.
- Stale detail state: when switching between items rapidly, the detail panel may briefly show old data. Fixed in most pages with useEffect cleanup.
- Launchpad cards: when many page cards exist, the last card(s) may not render due to CSS container constraints. Verify via sidebar navigation as fallback.
- Devin Review may flag issues — always check PR comments and fix before testing.
- **Admin login may fail after db:reset**: Seed data uses placeholder password hash. Register a new user via API as workaround.
- **New discussion threads show "NaNd ago"**: Relative timestamp display doesn't parse ISO dates from freshly created threads. Cosmetic only.

## Testing Strategy

1. **Extract expected values** from mock data files before testing
2. **Use adversarial test plans** with exact pass/fail criteria
3. **Verify summary strips first** — wrong counts = broken data pipeline
4. **Test filters** — select, verify count, clear, verify restoration
5. **Test tabs** — click each, verify content renders with correct data
6. **Test modals** — open, verify form fields, close
7. **For POST writes** — curl POST → psql verify → GET verify → UI verify (4-step pattern)
8. **Record browser interactions** for visual proof
9. **Annotate recordings** with setup/test_start/assertion markers

## Devin Secrets Needed

None — all mock data, no external services required for testing. Auth uses local JWT with dev secret.
