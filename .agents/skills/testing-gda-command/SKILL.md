---
name: testing-gda-command
description: Test GDA Command v2 end-to-end. Use when verifying UI pages, API endpoints, or new milestone features.
---

# Testing GDA Command v2

## Environment Setup

1. Backend: `cd packages/backend && npm run dev` → runs on port 3001
2. Frontend: `cd packages/frontend && npm run dev` → runs on port 3000
3. If ports are occupied, kill old processes: `fuser -k 3001/tcp; fuser -k 3000/tcp`
4. Frontend proxies `/api/*` to backend via Vite config
5. No CI configured — repo has no automated checks

## Architecture

- Monorepo: `packages/backend`, `packages/frontend`, `packages/shared`
- Backend: Express + TypeScript, mock data in `packages/backend/src/data/`
- Frontend: React + TypeScript + Vite, pages in `packages/frontend/src/pages/`
- Shared types: `packages/shared/src/index.ts`
- All API responses use `successEnvelope(workflow, action, data, meta, dryRun)` wrapper
- Navigation: Collapsible sidebar (220px expanded / 52px collapsed)
  - BD Tools: Launchpad, Fast Track, Ops Tracker, Pipeline, Capture, Approvals, RFP Shredder
  - Analysis: Intel Hub, Compliance, Proposals, Contacts, Financials, Reports, Knowledge, Predictive, Color Review
  - Platform: QA Center, Doctrine, Prompts, Workflows, Settings
- Financial KPI strip: persistent header with Orders/Sales/EBIT/ROS/Backlog/Gross Profit
  - May not render on initial load due to fetch race condition — hard reload fixes it

## Testing Pattern

For each new page:
1. Compute exact expected values from mock data files before testing
2. Use `npx tsx -e "import { MOCK_DATA } from './path'; console.log(...)"` to extract values programmatically
3. Navigate to the page, verify summary strip KPIs match computed values
4. Click through detail panels and tabs, verify data renders correctly
5. Test filters (dropdowns, search) — verify exact result counts
6. Test Launchpad card navigation back to the page
7. Record browser interactions with annotate_recording tool

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
- **Launchpad card**: May not render due to CSS container overflow — card is last in Home.tsx and might be clipped. Sidebar navigation to `/anomaly` works as fallback.
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
- Sidebar Navigation: 3 groups — BD Tools (7), Analysis (10), Platform (5). Collapse toggle: 220px expanded / 52px collapsed icons-only rail with tooltips.

## Common Issues

- Financial KPI strip may not render on first load — the component returns null when kpis array is empty due to fetch race. Hard reload fixes it.
- Ops Tracker main table may show 500 error — n8n connection timeout, mock fallback doesn't fire for that endpoint.
- Stale detail state: when switching between items rapidly, the detail panel may briefly show old data. Fixed in most pages with useEffect cleanup.
- Launchpad cards: when many page cards exist, the last card(s) may not render due to CSS container constraints. Verify via sidebar navigation as fallback.
- Devin Review may flag issues — always check PR comments and fix before testing.

## Testing Strategy

1. **Extract expected values** from mock data files before testing
2. **Use adversarial test plans** with exact pass/fail criteria
3. **Verify summary strips first** — wrong counts = broken data pipeline
4. **Test filters** — select, verify count, clear, verify restoration
5. **Test tabs** — click each, verify content renders with correct data
6. **Test modals** — open, verify form fields, close
7. **Record browser interactions** for visual proof
8. **Annotate recordings** with setup/test_start/assertion markers

## Devin Secrets Needed

None — all mock data, no external services required for testing.
