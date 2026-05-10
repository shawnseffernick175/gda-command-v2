---
name: testing-gda-command
description: Test GDA Command v2 end-to-end. Use when verifying frontend UI, backend API, or feature changes across the monorepo.
---

# Testing GDA Command v2

## Architecture

- **Monorepo** with npm workspaces: `@gda/shared`, `@gda/backend`, `@gda/frontend`
- **Backend**: Express on port 3001
- **Frontend**: Vite React on port 3000, proxies `/api` and `/health` to :3001
- **Mock fallback**: When `DATABASE_URL` is not set, backend returns in-memory mock data. The UI shows a "Mock data" badge (blue). When connected to Postgres, it shows "Live DB" (green).

## Starting Dev Servers

```bash
# From repo root
npm install
npm run build --workspace=@gda/shared

# Terminal 1 — Backend
cd packages/backend
node --env-file=.env node_modules/.bin/tsx watch src/server.ts

# Terminal 2 — Frontend
npm run dev --workspace=@gda/frontend
```

Backend `.env` may contain:
- `N8N_BASE_URL` / `N8N_API_KEY` — for live n8n health checks (QA Center)
- `DATABASE_URL` — for Postgres connectivity
- `QUALIFY_WRITES_ENABLED=true` — to enable real qualify writes (dangerous, only for testing)

Without these, everything falls back to mock data gracefully.

## Devin Secrets Needed

- `N8N_API_KEY` — stored as repo-scoped secret. Used for QA Center live health checks and workflow registry.
- No other secrets required for mock-mode testing.

## Key Pages to Test

### QA Center (`/qa-center`)
- Health check cards (8 checks when live n8n, 6 mock)
- Failures table (different columns for live vs mock)
- Source badge: "Live n8n" or "Mock data"

### Ops Tracker (`/ops-tracker`)
- Table with 10 mock opportunities sorted by Score DESC by default
- Summary strip: Count, Total Value, Avg Pwin, Avg Score
- Filter bar: search input, status dropdown, department dropdown, min Pwin
- "Qualify" button only on discovery-status rows (3 of 10 in mock data: opp-003, opp-005, opp-009)
- Qualify dry-run modal: shows status transition and correlation ID (format: `GDA-{timestamp}-{random}`)

## Testing Ops Tracker Specifically

1. **Verify initial load**: 10 rows, summary strip shows Count 10 / Total Value $166.9M / Avg Pwin 58% / Avg Score 72.4
2. **Status filter**: Select "Discovery" → expect 3 rows with updated summary
3. **Search filter**: Type "USACE" → expect 2 rows
4. **Qualify dry-run**: Click Qualify on a discovery row → modal shows "discovery → qualified" with correlation ID
5. **Sort**: Click column headers to toggle sort direction

## API Verification via curl

```bash
# List all opportunities
curl http://localhost:3001/api/opportunities

# Filter by status
curl "http://localhost:3001/api/opportunities?status=discovery"

# Search
curl "http://localhost:3001/api/opportunities?search=USACE"

# Qualify dry-run
curl -X POST http://localhost:3001/api/opportunities/opp-003/qualify \
  -H "Content-Type: application/json" -d '{"dryRun":true}'
```

## Common Issues

- If `@gda/shared` types are not found, run `npm run build --workspace=@gda/shared` first to generate dist files.
- The frontend Vite proxy requires the backend to be running on :3001. Start backend before frontend.
- If summary strip values seem wrong, verify against the API response — the frontend calculates from the returned data.
- The backend sorts mock data in-memory. When using Postgres, sorting happens via SQL ORDER BY.
