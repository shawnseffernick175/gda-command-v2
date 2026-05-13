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
3. **Database seed**: `cd packages/backend && npm run db:seed` (populates opportunities, intel items, risks, company profile, etc.)
4. **Database reset**: `cd packages/backend && npm run db:reset` (drops all, re-migrates, re-seeds)
5. Backend: `cd packages/backend && DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command AUTH_REQUIRED=false npm run dev` → runs on port 3001
6. Frontend: `cd packages/frontend && npm run dev` → runs on port 3000
7. If ports are occupied, kill old processes: `fuser -k 3001/tcp; fuser -k 3000/tcp`
8. Frontend proxies `/api/*` to backend via Vite config
9. CI: GitHub Actions runs Build/Typecheck and Test checks on PRs

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
- Financial KPI strip: persistent header showing "Financial KPIs unavailable" with Retry button when no data seeded
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

## AI Agent Testing

### Dual-Model LLM

- Backend uses GPT-4o (`tier="fast"`) for scoring/briefings and Claude Sonnet (`tier="deep"`) for analysis/writing
- Requires `OPENAI_API_KEY` env var for agent scoring features
- Requires `ANTHROPIC_API_KEY` for deep analysis features
- Health check: `GET /health/detailed` → `ai_models` component shows `models.fast: true`

### Agent Infrastructure

- **Agent runner framework**: `packages/backend/src/lib/agent-runner.ts` — tracks runs in `agent_runs` table
- **Agent config**: `packages/backend/src/db/migrations/013_agent_infrastructure.sql` — seeds 6 agents
- **Agent management API**: `GET /api/agents` (list all), `GET /api/agents/:name` (detail), `POST /api/agents/:name/toggle` (enable/disable)
- **Approval queue API**: `GET /api/agents/approvals/pending`, `POST /api/agents/approvals/:id/approve`, `POST /api/agents/approvals/:id/reject`

### Testing Opportunity Watch Agent

1. **Setup test data**: After `db:reset`, clear AI scores on specific opps to make them unscored:
   ```sql
   UPDATE sam_opportunities SET ai_summary = NULL, relevance_score = 0
   WHERE id IN ('sam-001','sam-002','sam-003','sam-004','sam-005');
   ```
2. **Test qualified status preservation**: Set one opp to qualified before scoring:
   ```sql
   UPDATE sam_opportunities SET scan_status = 'qualified' WHERE id = 'sam-005';
   ```
3. **Navigate to SAM Monitor**: `http://localhost:3000/sam-monitor` (hidden route, no sidebar link)
4. **Click "AI Score All"** button in toolbar (purple button next to "Trigger Scan")
5. **Wait ~15-30 seconds** for GPT-4o to score all unscored opportunities
6. **Verify success message**: Green text showing "Scored N opportunities: X pursue, Y evaluate, Z pass"
7. **Verify qualified preservation**: Check DB: `SELECT scan_status FROM sam_opportunities WHERE id = 'sam-005'` — should still be 'qualified'
8. **Verify agent run**: Navigate to Agent Command Center (`/approvals`) → Agent Runs tab → should show Opportunity Watch | completed | N items
9. **Verify intel entries**: If any opps scored as evaluate/pursue, check intel_items table for new entries

### Testing Morning Commander Agent

1. Navigate to Intel Hub (`/intel`) → Morning Briefing tab
2. Click "Generate Now" button
3. Wait ~10-20 seconds for GPT-4o to synthesize briefing
4. Verify briefing content appears with sections (pipeline, risks, deadlines, etc.)

### Agent Command Center (`/approvals`)

- **Agent Actions tab**: Shows pending approval queue items from all agents
- **Agent Runs tab**: Shows execution history (agent name, trigger, status, duration, items processed, errors)
- **Agent Config tab**: Shows all 6 agents with enable/disable toggles and schedules

## SPA Caching Gotcha

**IMPORTANT**: When testing with the React SPA, the browser may show stale data after a `db:reset` or DB update if the page was already loaded. The SPA keeps React state in memory even after browser refresh attempts.

**Workaround**: Navigate away to a different page (e.g., click Launchpad in sidebar) then navigate back to the test page. This forces React to unmount and remount the component, triggering fresh API fetches. A simple F5 or Ctrl+Shift+R may NOT clear the SPA state.

## Full E2E Audit Pattern (38 items)

When doing a comprehensive audit, navigate every page and verify:
1. **Page loads**: No blank screen, no crash, no unhandled error
2. **Source badge**: Shows "Live DB" / "Live — database" (NOT "Mock data")
3. **Data state**: Shows real DB data or proper empty state (0 counts, empty message)
4. **No errors**: No console errors, no 500 badges, no broken components
5. **Key feature**: At least one interaction works (filter, tab, button, expand)

### Seeded Test Data

- 10 opportunities (opp-001 to opp-010), all status "Interest", due dates Aug 2026 – Feb 2027
- 12 SAM opportunities (sam-001 to sam-012), various scan_status (new/tracked/qualified/dismissed)
- 15 intel items, 7 risks, 6 morning briefings, 10 FPDS awards
- Envision Innovative Solutions company profile: $382M revenue, 41 employees, SDVOSB/Small Business
- NAICS: 541512, 541519, 541611 +5 more

### Navigation Tips

- Use sidebar links for navigation (not address bar) to preserve session/auth state
- For hidden routes without sidebar links, type URL directly in address bar
- Sidebar collapse toggle: click ◀ to collapse to icon-only rail (~52px), click ▶ to expand back
- **After db:reset**: Navigate away and back to force fresh data fetch (see SPA Caching Gotcha above)

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
| Financial KPI strip | Observe top header — shows "Financial KPIs unavailable" + Retry when no data |
| 404 page | Navigate to `/nonexistent-page`, verify "Page not found" with Back to Launchpad link |

## Known Issues

- **Predictive Analytics crash**: `/predictive` might crash with `Cannot read properties of undefined (reading 'overall_win_rate')` when DB returns empty data. Frontend might not handle undefined response.
- **FPDS Monitor calculation errors**: `/fpds-monitor` might show Total Value as "$NaN" and Avg Relevance as "null%" — data parsing issue in aggregate calculations.
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
| sam-monitor | `POST /trigger-opportunity-watch` | Run AI scoring agent on unscored opps |
| reports | `POST /generate` | INSERT generated_reports |
| reports | `POST /export` | INSERT export_jobs |
| capture | `POST /gate-review` | UPDATE gate_reviews JSONB |
| agents | `POST /:name/toggle` | UPDATE agent_config enabled status |
| agents/approvals | `POST /:id/approve` | UPDATE approval_queue status |
| agents/approvals | `POST /:id/reject` | UPDATE approval_queue status |

## Testing Strategy

1. **Navigate systematically** through all sidebar groups
2. **Verify source badges** — "Live DB" means real data, no mock fallbacks
3. **Check empty states** — pages with no DB data should show 0 counts + empty message (NOT mock data)
4. **Test NAICS Size filter** on Ops Tracker: All=10, Small varies, Large varies
5. **Test filters and tabs** — click each, verify content renders
6. **Record browser interactions** with annotate_recording tool
7. **For POST writes** — curl POST → psql verify → GET verify → UI verify (4-step pattern)
8. **For AI agents** — set up test data in DB, trigger via UI, verify results in UI + DB + Agent Command Center

## Devin Secrets Needed

- `OPENAI_API_KEY` — Required for AI agent scoring (Opportunity Watch, Morning Commander)
- `ANTHROPIC_API_KEY` — Required for deep analysis features (Capture Coach, proposal writing)
- No secrets needed for basic UI testing with `AUTH_REQUIRED=false`
