# GDA Command v2

Shawn's operating system for Golden Dome / GDA business development, capture, competitive intelligence, opportunity management, and platform health.

## Architecture

```
React Command Center (Vite + TypeScript)   :3000
        ↓  /api proxy
GDA API Gateway (Express + TypeScript)     :3001
        ↓
Postgres  ·  n8n  ·  AI / external data
        ↓
QA Center  ·  Controlled Fix Agent  ·  Human Approval Queue
```

## Monorepo Structure

```
packages/
  shared/       — Shared TypeScript types (GDA envelope, QA types, etc.)
  backend/      — Express API server
  frontend/     — React + Vite SPA
```

## Quick Start

```bash
# Install all workspace dependencies
npm install

# Build the shared types package
npm run build --workspace=@gda/shared

# Start the backend (port 3001)
npm run dev --workspace=@gda/backend

# In another terminal, start the frontend (port 3000)
npm run dev --workspace=@gda/frontend
```

## Available Routes

### Frontend
| Route | Page |
|---|---|
| `/` | Launchpad — KPI strip, opportunity funnel, top opportunities, quick access |
| `/qa-center` | QA Center — health checks & latest failures |
| `/ops-tracker` | Ops Tracker — opportunity list, filtering, sorting, qualify dry-run |
| `/pipeline` | Pipeline — read-only qualified pipeline view with filtering & sorting |
| `/opportunities/:id` | Opportunity Detail — OODA analysis, sources, learning (S-009) |
| `/doctrine` | Doctrine — sprint doctrine drafts, finalization gates, publish history |
| `/intel` | Intel Hub — intelligence feed, morning briefings, deep research, competitor watch |

### Backend API
| Endpoint | Description |
|---|---|
| `GET /api/qa/health` | Platform health status with individual check results |
| `GET /api/qa/latest-failures` | Most recent workflow failures |
| `GET /api/opportunities` | List all opportunities with filtering & sorting |
| `GET /api/opportunities/pipeline` | Pipeline-only opportunities (status=pipeline) |
| `GET /api/opportunities/:id/detail` | Opportunity detail with OODA analysis (S-009) |
| `POST /api/opportunities/:id/qualify` | Qualify dry-run / write with S-007/S-008 safety gates |
| `GET /api/dashboard/kpis` | Dashboard KPIs, funnel stats, and top opportunities |
| `GET /api/doctrine/drafts` | List doctrine drafts with sprint/status/type filtering |
| `GET /api/doctrine/drafts/:id` | Single doctrine draft detail |
| `GET /api/doctrine/publish-runs` | Publish run history with gate results |
| `POST /api/doctrine/finalize` | Trigger sprint finalization with gate checks (dry-run) |
| `GET /api/intel/feed` | Intelligence feed with category/priority/source filtering |
| `GET /api/intel/briefings` | Morning briefings list (filterable by date) |
| `GET /api/intel/briefings/:id` | Single briefing detail |
| `GET /api/intel/research` | Deep research reports (filterable by status) |
| `GET /api/intel/research/:id` | Single research report detail |
| `GET /api/intel/competitors` | Competitor profiles with threat scores |

All API responses follow the standard GDA envelope: `{ success, workflow, action, dryRun, data, meta, error }`.

## Database

The Postgres schema is in `packages/backend/src/db/init.sql`. It defines:
- `opportunities` — opportunity records (S-009 spec)
- `doctrine_drafts` — sprint doctrine drafts (doctrine automation spec)
- `doctrine_publish_runs` — publish run tracking

## Type Checking

```bash
npm run typecheck   # Checks all workspaces
```
