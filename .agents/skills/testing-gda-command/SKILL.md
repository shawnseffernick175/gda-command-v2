---
name: testing-gda-command
description: Test GDA Command v2 end-to-end. Use when verifying UI pages, API endpoints, or new milestone features.
---

# Testing GDA Command v2

## Environment Setup

### Local Development
- Frontend: `http://localhost:3000` (SvelteKit)
- Backend: `http://localhost:3001` (Express/Node)
- Database: PostgreSQL at `localhost:5432/gda_command`
- Start backend with: `DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command AUTH_REQUIRED=false JWT_SECRET=dev-secret-key OPENAI_API_KEY=$OPENAI_API_KEY GDA_WEBHOOK_KEY=test-webhook-key npm run dev` (from `packages/backend`)
- Start frontend with: `npm run dev` (from `packages/frontend`)
- Auth is disabled in dev (`AUTH_REQUIRED=false`) but the login page still appears — use `admin@gda-command.local` / `admin123`

### Production
- URL: `https://gda.csr-llc.tech`
- Deploy via: `docker-compose -f docker-compose.prod.yml up -d --build` on the production server
- SSH may be needed to run migrations on the production database

### Database Notes
- The `description` column may not exist locally — run `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS description TEXT;` if backend returns empty results
- The `capture_stage` column stores explicit Shipley stage overrides — check it exists if stage dropdown tests fail
- Run pending migrations from `packages/backend/src/db/migrations/` if features are missing
- PostgreSQL returns NUMERIC columns as strings — always use `Number()` for comparisons in backend code
- Test data: 5 seeded opportunities (opp-test-001 through opp-test-005) plus ~42 n8n webhook-injected opportunities

### Port Management
- If port 3001 is already in use: `ss -tlnp | grep 3001` to find the PID, then `kill <PID>`
- `lsof` may not be available — use `ss` instead

## Devin Secrets Needed
- `PROD_SSH_KEY` — SSH key for production server access
- `OPENAI_API_KEY` — for AI analysis features (OODA, Capture Coach, AI Gateway summarizer)

## Key Testing Flows

### W6: Capture Discipline Dashboard
**Test procedure:**
1. Navigate to `/capture-discipline` via sidebar (Intelligence > Capture Discipline)
2. Verify KPI cards: Active Opportunities, With Gate Reviews, Overdue, At Risk
3. Verify Stage Funnel bar chart (Interest, Pursue, Won stages)
4. Verify Gate Review Summary matrix (5 gates × 5 statuses)
5. Verify Guardrail Alerts section

### W6: Guardrail Check API
**Test procedure:**
1. `POST /api/capture-discipline/check-guardrails/opp-test-003` — should return overdue alert (critical) since due_date is 2025-04-01
2. Verify `checked: 4` (all 4 guardrail rules evaluated)
3. Verify score=45 does NOT trigger missing_score (Number() fix)
4. Reload `/capture-discipline` — At Risk metric should update
5. Guardrail 4 (stage_without_gate) uses allowlist: only `["passed", "waived"]` gate statuses suppress the alert

### W8: AI Gateway
**Test procedure:**
1. Navigate to `/ai-gateway` via sidebar
2. Verify status cards: Status=Online, Fast Model=gpt-4o
3. Type text into summarizer textarea, click Summarize
4. Verify 3-sentence summary appears, Recent Activity table updates
5. `GET /api/ai-gateway/status` — verify `available: true`, `fast_model: "gpt-4o"`

**Notes:**
- Summarizer requires OPENAI_API_KEY to be set
- LLM may fall back to Anthropic ("deep" tier); actual tier returned in `result.tier`
- Usage logging stores tier from `result.tier`, not the requested tier

### W5: Opportunity Detail Tabs
**Test procedure:**
1. Navigate to any opportunity detail (e.g., `/opportunities/opp-test-001`)
2. Click through all 5 tabs: Overview, Analysis, Intelligence, Strategy, History
3. **History tab is critical** — it queries `record_version` table for timeline data
4. Verify Activity Timeline shows events and Version History shows version entries

### Sidebar Navigation — All Sprint v3 Pages
**Test procedure:**
1. Click each new nav item in sidebar:
   - Vehicles → `/vehicles` (W1)
   - Data Sources → `/sources` (W2)
   - M&A Context → `/mergers` (W4)
   - Capture Discipline → `/capture-discipline` (W6)
   - AI Gateway → `/ai-gateway` (W8)
2. Verify each page loads without error (no NotFound page)

### OpsTracker Stage Dropdown (capture_stage)
**Why adversarial:** Multiple Shipley stages map to the same DB status. "Solicitation" and "Post Submittal" both map to `"pipeline"`. Without the `capture_stage` fix, `statusToShipley("pipeline")` returns `"pursue"`, silently reverting the user's choice.

**Test procedure:**
1. Navigate to `/ops-tracker`
2. Find an opportunity (e.g., opp-004)
3. Change dropdown to "Solicitation" — wait for page data refresh
4. Press F5 for full page reload
5. Verify dropdown still shows "Solicitation" (not "Pursue")
6. Repeat with "Post Submittal" — same verification
7. Click the opportunity row to open `/opportunities/{id}`
8. Verify the detail page dropdown matches the OpsTracker dropdown

**What to check in HTML:** The `<select>` element's `selectedindex` attribute and the `selected="true"` option value.

### KPI Strip
- Should show exactly 5 KPIs: Orders, Sales, EBIT, Gross Profit, ROS
- Values should be real Q1 FY2026 data (not placeholder/mock)
- Each KPI has a drill-down on click

### No Bid Filtering
- Default OpsTracker view should NOT show "No Bid" opportunities
- "No Bid" filter option exists in the status dropdown for explicit viewing
- Expired opportunities (past due date) should be "No Bid", not "Lost"

### Knowledge Base Upload
- Test with both PDF and XLSX files
- XLSX files may arrive as `application/octet-stream` MIME type — the backend has extension-based fallback
- 27 document types available in dropdown
- 7 action options (Store & Index, Ingest into Financial Bible, etc.)
- Selecting "Financials" type auto-sets action to "Ingest into Financial Bible"

### Financial Bible
- Monthly trend charts (Revenue, Orders, Profitability, Cost Breakdown)
- YTD vs Annual Target progress bars with pace markers
- Monthly breakdown table with Jan/Feb/Mar actuals
- Variance analysis with month-over-month changes

## Common Issues
- **Backend returns empty results:** Check `DATABASE_URL` env var is set, and required columns exist
- **Stage dropdown reverts after reload:** The `capture_stage` column or the frontend `opp.capture_stage ?? statusToShipley(opp.status)` logic may be missing
- **XLSX upload fails:** Check MIME type handling — extension-based fallback should handle `application/octet-stream`
- **Health tab errors:** Check for missing columns in agent queries (e.g., `summary` column)
- **401 errors on pages:** JWT token may have expired — check auto-refresh logic
- **PostgreSQL NUMERIC as string:** pg driver returns NUMERIC columns as strings. Use `Number()` for all numeric comparisons in backend code (e.g., `Number(row.score) === 0` not `row.score === 0`)
- **Backend won't start:** Ensure all required env vars are exported: DATABASE_URL, AUTH_REQUIRED, JWT_SECRET, OPENAI_API_KEY, GDA_WEBHOOK_KEY
- **Port 3001 in use:** Use `ss -tlnp | grep 3001` to find PID, then kill it. `lsof` might not be available.
- **Session expiration during testing:** Log in once and use sidebar navigation to stay in the SPA. Direct URL navigation may trigger session expiry.
