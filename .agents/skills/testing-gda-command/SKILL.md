---
name: testing-gda-command
description: Test GDA Command v2 end-to-end. Use when verifying UI pages, API endpoints, or new milestone features.
---

# Testing GDA Command v2

## Environment Setup

1. **PostgreSQL**: `docker compose up -d postgres` from repo root → starts postgres container on port 5432
   - Verify: `docker ps --format '{{.Names}} {{.Status}}'` should show postgres container `Up ... (healthy)`
   - Connection: `postgresql://gda:gda_dev_password@localhost:5432/gda_command`
   - **IMPORTANT**: The VM may have a system-level `DATABASE_URL` env var pointing to a different database (e.g., n8n). Always start the backend with explicit override: `DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command npm run dev`
   - **IMPORTANT**: After VM restart, the postgres container name may change (e.g., `gda-postgres-dev` → `gda-postgres`). Always check `docker ps` for the actual container name before running `docker exec` commands.
2. **Database migrations**: `cd packages/backend && npm run db:migrate` (runs SQL migrations)
3. **Database seed**: `cd packages/backend && npm run db:seed` (populates records)
4. **Database reset**: `cd packages/backend && npm run db:reset` (drops all, re-migrates, re-seeds)
   - **Note**: `db:reset` may fail on certain migrations (e.g., migration 007 capture_stage column). If so, seed data directly via SQL INSERT statements.
5. Backend: `cd packages/backend && DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command npm run dev` → runs on port 3001
6. Frontend: `cd packages/frontend && npm run dev` → runs on port 3000
7. If ports are occupied, kill old processes: `fuser -k 3001/tcp; fuser -k 3000/tcp`
8. Frontend proxies `/api/*` to backend via Vite config

## Architecture

- Monorepo: `packages/backend`, `packages/frontend`, `packages/shared`
- Backend: Express + TypeScript
- Frontend: React + TypeScript + Vite, pages in `packages/frontend/src/pages/`
- Shared types: `packages/shared/src/index.ts`
- All API responses use `successEnvelope(workflow, action, data, meta, dryRun)` wrapper
- **Data flow**: Routes try n8n webhook first, then PostgreSQL DB. There is NO mock data fallback — if DB has no data, empty arrays/0 counts are returned.
- **Source badges**: Pages show "Live DB" or "Live — database" badges. No "Mock data" badge should ever appear.
- Navigation: Collapsible sidebar (220px expanded / 52px collapsed)
  - Operations: Launchpad, Fast Track, Ops Tracker, Pipeline, Approvals, Risk Register
  - Capture: Capture Plans, Proposals, RFP Shredder, Compliance, Color Review
  - Intelligence: Intel Hub, Predictive, Anomaly Detection, Contacts, Knowledge Base, CPARS Builder, GovWin IQ
  - Reporting: Financials, Reports, Charts, Discussions
  - Admin: Settings, Health, Workflows, Doctrine, Book of Truths, Prompts, User Manual
- Financial KPI strip: persistent header with Orders/Sales/EBIT/ROS/Backlog/Gross Profit
  - May show "Financial KPIs unavailable" with Retry button if no financial data seeded

## Auth System

- **Dev mode** (`AUTH_REQUIRED=false` in `.env`): Auth middleware injects admin user for all requests. However, frontend still probes `/api/auth/me` — if no user exists in DB, login page will show.
- **Production mode** (`AUTH_REQUIRED=true`): JWT-based auth enforced on all `/api/*` routes except `/api/auth/*`.
- **Auth endpoints**: POST `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/logout`, GET `/api/auth/me`
- **Token storage**: localStorage keys `gda_access_token`, `gda_refresh_token`, `gda_user`
- **Test user**: Register via `curl -s -X POST http://localhost:3001/api/auth/register -H 'Content-Type: application/json' -d '{"email":"tester@gda.local","password":"tester123","display_name":"Test User"}'`
- **Login via UI**: Email: `tester@gda.local`, Password: `tester123`
- **WARNING**: After `db:reset`, the test user may not exist. Re-register before testing.
- **Login stuck on "Please wait..."**: If postgres was down during login attempt, the form gets stuck. Navigate to a fresh URL to reset the form state.

## NAICS Size Classification

Opportunities on the Ops Tracker page have NAICS-based size classification:
- **Small Business**: Company falls below SBA size standard threshold for the opportunity's NAICS code
- **Large Business**: Company exceeds the threshold
- Uses Envision Innovative Solutions context: ~$382M revenue, ~41 employees
- Most defense/IT NAICS codes (541512, 541511, 541519) have revenue-based thresholds ($34M-$47M) → Envision is "large"
- Software publishing (511210) has employee-based threshold (1,250 employees) → Envision is "small"

### Testing NAICS Filter
1. Navigate to `/ops-tracker`
2. Verify "NAICS Size" dropdown exists (after Department dropdown)
3. Default "All NAICS sizes" shows all opportunities
4. Select "Small Business" → should show only opportunities where Envision is below SBA threshold
5. Select "Large Business" → should show only opportunities where Envision exceeds SBA threshold
6. Verify NAICS Size column shows blue "Small" or amber "Large" badges
7. Verify the count in the summary strip updates to match filtered results

## Testing Pattern

For pages with live DB data:
1. Seed test data into PostgreSQL before testing (INSERT statements or db:seed)
2. Verify API returns expected data: `curl -s http://localhost:3001/api/<endpoint> | jq .`
3. Navigate to the page, verify summary strip KPIs match seeded data
4. Test filters — verify exact result counts change correctly
5. Record browser interactions with annotate_recording tool

For pages with no DB data (empty state testing):
1. Navigate to the page
2. Verify all KPIs show 0 or $0
3. Verify "Live — database" or "Live DB" badge is shown
4. Verify NO "Mock data" text appears anywhere
5. Verify empty state message (e.g., "No approvals match filters.")

## POST Write Persistence Testing

For testing endpoints that write to PostgreSQL:

1. **Record initial state**: `docker exec <postgres-container> psql -U gda -d gda_command -c "SELECT id, status FROM <table> WHERE id='<id>'"`
2. **Call POST endpoint**: `curl -s -X POST http://localhost:3001/api/<endpoint> -H 'Content-Type: application/json' -d '{...}'`
3. **Verify API response**: Check `success: true`, `dryRun: false`, and returned data matches expected
4. **Verify DB persistence**: `docker exec <postgres-container> psql -U gda -d gda_command -c "SELECT ... FROM <table> WHERE ..."`
5. **Verify UI renders updated data**: Navigate to the page in browser and confirm the change is visible

### POST Endpoints with Real DB Writes

| Route | Endpoint | DB Operation |
|-------|----------|--------------|
| approvals | `POST /:id/resolve` | UPDATE approvals status/resolved_by/at/notes |
| anomaly | `POST /anomalies/:id/acknowledge` | UPDATE status + acknowledged_at |
| anomaly | `POST /anomalies/:id/resolve` | UPDATE status + resolved_at |
| discussions | `POST /threads` | INSERT discussion_threads |
| discussions | `POST /threads/:id/messages` | INSERT message + UPDATE thread count |
| doctrine | `POST /finalize` | UPDATE drafts + INSERT publish run |
| reports | `POST /generate` | INSERT generated_reports |
| reports | `POST /export` | INSERT export_jobs |
| capture | `POST /gate-review` | UPDATE gate_reviews JSONB |

## Page-Specific Testing Data

### Ops Tracker (`/ops-tracker`)
- **Data source**: PostgreSQL `opportunities` table
- **NAICS Size column**: blue "Small" badge or amber "Large" badge
- **NAICS Size filter**: dropdown with All/Small Business/Large Business
- **Test data**: Seed 7 opportunities with various NAICS codes (at least one with employee-based NAICS like 511210 for "small")
- **API**: GET `/api/opportunities` returns `{ opportunities: [...], source: "db" }`
- **Enrichment**: Backend enriches each opportunity with `naics_size` field based on SBA standards

### Color Review (`/color-review`)
- **5 phases**: White (#94a3b8), Pink (#ec4899), Green (#22c55e), Red (#ef4444), Gold (#eab308)
- **Phase-specific tabs**: Pink=Compliance, Red=Sections, Gold=Gold Checks, Green=Cost Items, White=Format Checks

### Predictive Analytics (`/predictive`)
- **4 tabs**: ML Pwin Models, Revenue Forecast, Bid/No-Bid Optimizer, Win/Loss Patterns

### RFP Shredder (`/rfp-shredder`)
- Supports PDF, DOCX, XLSX, PPTX, TXT, CSV file upload and parsing
- **4 tabs**: Requirements, Compliance Map, Response Outline, Job History

### Risk Register (`/risk-register`)
- If-this-then-that risk tracking with heat map matrix and scenario evaluator

### Capture Planner (`/capture`)
- Shipley Stage Timeline: Pre-RFP → RFP Released → Proposal Prep → Submitted → Evaluation → Awarded
- KPI cards are clickable for drill-down filtering

## Common Issues

- **System DATABASE_URL override**: The VM might have a system-level `DATABASE_URL` env var (e.g., pointing to n8n's postgres). Always start backend with explicit `DATABASE_URL=...`.
- **Postgres container name changes after restart**: Check `docker ps` for actual container name before using `docker exec`.
- **Login form stuck on "Please wait..."**: Happens when postgres was down during login. Navigate to fresh URL to reset.
- **Backend crash on DB failure**: Some auth endpoints lack try/catch around `pool.query()`. If DB connection fails, the backend process may crash.
- **Financial KPI strip**: May show "Financial KPIs unavailable" — this is expected if no financial data is seeded.
- **db:reset may fail**: Migration 007 (capture_stage column) might error. Workaround: seed data directly via SQL.
- **Empty pages are expected**: With mock data removed, pages without seeded DB data will show 0 counts. This is correct behavior.
- Devin Review may flag issues — always check PR comments and fix before testing.

## Deployment

- **Production**: `docker compose up --build -d` from repo root → rebuilds all 3 containers (frontend, backend, postgres)
- **Production URL**: https://gda.csr-llc.tech
- **Verify deployment**: `docker ps --format '{{.Names}} {{.Status}}'` should show all 3 containers as `Up ... (healthy)`
- **API check**: `curl -s https://gda.csr-llc.tech/api/health` should return 200

## Testing Strategy

1. **Seed test data** into PostgreSQL before testing pages that need data
2. **Verify API first** with curl before testing UI — catches backend issues early
3. **Verify summary strips** — wrong counts = broken data pipeline
4. **Test filters** — select, verify count, clear, verify restoration
5. **Test empty states** — pages with no data should show 0 counts, not errors
6. **Verify source badges** — should show "Live DB" or "Live — database", never "Mock data"
7. **For POST writes** — curl POST → psql verify → GET verify → UI verify (4-step pattern)
8. **Record browser interactions** for visual proof
9. **Annotate recordings** with setup/test_start/assertion markers

## Devin Secrets Needed

None — local JWT auth with dev secret. No external API keys required for testing.
