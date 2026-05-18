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
- Start backend with: `DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command npm run dev` (from `packages/backend`)
- Start frontend with: `npm run dev` (from `packages/frontend`)

### Production
- URL: `https://gda.csr-llc.tech`
- Deploy via: `docker-compose -f docker-compose.prod.yml up -d --build` on the production server
- SSH may be needed to run migrations on the production database

### Database Notes
- The `description` column may not exist locally — run `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS description TEXT;` if backend returns empty results
- The `capture_stage` column stores explicit Shipley stage overrides — check it exists if stage dropdown tests fail
- Run pending migrations from `packages/backend/src/db/migrations/` if features are missing

## Devin Secrets Needed
- `PROD_SSH_KEY` — SSH key for production server access
- `OPENAI_API_KEY` — for AI analysis features (OODA, Capture Coach)

## Key Testing Flows

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
