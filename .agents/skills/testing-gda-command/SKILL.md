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
- **Mock data**: 9 ColorReview objects in `color-review-mock.ts`
- **Summary strip**: Reviews=9, Pink=4, Red=3, Gold=2, Avg Score=74% (amber), Proposals=6, GO/Cond/No-Go=0/1/1
- **CR-001** (Pink, USACE FUDS): 82% score, 85% pass rate, 12 compliance checks (7P/3F/2W), expandable with gap detail + blue suggestion boxes
- **CR-002** (Red, USACE FUDS): 78% score, 5 section scores (Tech=85, Mgmt=72, PP=88, Cost=65, ExecSum=76), expandable with strengths/weaknesses/discriminators grid
- **CR-003** (Gold, USACE FUDS): 74% score, CONDITIONAL GO (amber badge), 71% confidence, 6 gold checks (4P/1F/1W)
- **CR-009** (Gold, DCSA MPP): 42% score (red), NO-GO (red badge), 85% confidence, 6 gold checks (4F/1W/1P)
- **Tabs**: Compliance (pink), Sections (red), Gold Checks (gold), Risk Factors (all phases)
- **Filters**: Phase dropdown (Pink/Red/Gold), Status dropdown
- **Launchpad**: Pink (#ec4899) accent card in bottom section
- **API**: GET /api/color-review, GET /api/color-review/:id, POST /api/color-review/run (dry-run)

### Predictive Analytics (`/predictive`)
- **Mock data**: 6 opportunities, 147-opp historical analysis
- **Summary strip**: Opps=6, Win Rate=42%, Weighted=$68.2M, P50=$68.2M, Gap=$16.8M, Bid=3, Accuracy=87%
- **4 tabs**: ML Pwin Models (8-feature importance), Revenue Forecast (Monte Carlo P10/P50/P90), Bid/No-Bid Optimizer (3 bid/2 watch/1 no-bid), Win/Loss Patterns (8 patterns)
- **Bug fix verified**: Negative currency formatting (-$24.6M not $-24600000)
- **Launchpad**: Blue accent card

### RFP Shredder (`/rfp-shredder`)
- **Mock data**: 4 shred jobs, 42 requirements, compliance map, response outline
- **Summary strip**: Jobs=4, Requirements=42, Coverage=77%, Sections=13, Pages=94
- **4 tabs**: Requirements (expandable with SHALL/MUST keywords), Compliance Map, Response Outline, Job History
- **Launchpad**: Purple accent card

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

### Ops Tracker (`/ops-tracker`)
- Main table may show HTTP 500 (n8n timeout, mock fallback not firing) — pre-existing issue
- Smart Recommendations panel: 8 cards with type/priority badges

### Contacts (`/contacts`)
- **Mock data**: 25 contacts across 10+ agencies
- **Summary strip**: Total=25, Active=21, Pending=15, Gaps=13
- **5 tabs**: Overview, Meeting Notes, Relationships, Opportunities, Teaming
- **Inactive filter**: 1 result (Gregory Martinez)
- **PFAS search**: 6 results

### Proposals (`/proposals`)
- **Mock data**: 6 proposals
- **Summary strip**: Total=6, Active=4, RT Open=3, Compliance=69% (amber), $444.9M, Agencies=6
- **5 tabs**: Overview, Volumes, Red Team, Scorecard, Timeline

### Reports (`/reports`)
- **Mock data**: 8 templates, 12 reports, 5 schedules, 5 exports
- **4 tabs**: Templates, History, Schedules, Exports
- **Generate Report modal**: dry-run with format/section selection

## Common Issues

- Financial KPI strip may not render on first load — the component returns null when kpis array is empty due to fetch race. Hard reload fixes it.
- Ops Tracker main table may show 500 error — n8n connection timeout, mock fallback doesn't fire for that endpoint.
- Stale detail state: when switching between items rapidly, the detail panel may briefly show old data. This is fixed in most pages with useEffect cleanup.
- Devin Review may flag issues — always check PR comments and fix before testing.

## Devin Secrets Needed

None — all testing uses mock data with no external service dependencies.
