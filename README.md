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
| `/capture` | Capture Planner — capture plans, BD activities, milestones, gate reviews, teaming |
| `/workflows` | Workflow Manager — browse, search, and filter all n8n workflows |
| `/financial-bible` | Financial Bible — drill-down behind every KPI (Orders, Sales, EBIT, ROS, Backlog, Gross Profit) |
| `/financial-bible/:key` | Financial Bible — single KPI drill-down with line items, trends, and insights |
| `/prompts` | Prompt Architect — versioned prompt library with categories, tags, usage tracking |
| `/settings` | Settings — system config, connectors, feature flags, health check |

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
| `GET /api/capture/plans` | Capture plans with phase/decision filtering |
| `GET /api/capture/plans/:id` | Single capture plan detail with activities |
| `GET /api/capture/activities` | BD activity log across all captures |
| `POST /api/capture/gate-review` | Trigger gate review checks (dry-run) |
| `GET /api/financials/kpis` | Financial KPIs for persistent strip (Orders, Sales, EBIT, ROS, Funded Backlog, Backlog, Gross Profit) |
| `GET /api/financials/:key` | Financial Bible drill-down for a single KPI |
| `GET /api/prompts` | Prompt library with category/status/tag filtering |
| `GET /api/prompts/usage` | Recent prompt usage log |
| `GET /api/prompts/:id` | Prompt detail with version history and usage records |
| `GET /api/workflows/registry` | n8n workflow registry with status and metadata |
| `GET /api/settings` | System settings, connectors, feature flags |

All API responses follow the standard GDA envelope: `{ success, workflow, action, dryRun, data, meta, error }`.

## Persistent Financial KPI Strip

A global financial KPI strip is rendered below the navigation bar on every page. It displays:
- **Orders** · **Sales** · **EBIT** · **ROS** · **Funded Backlog** · **Backlog** · **Gross Profit**
- Each KPI shows current value and change indicator vs. prior period
- Clicking any KPI navigates to its Financial Bible drill-down
- Collapsible to save vertical space
- Falls back gracefully when financial data is not available

## Navigation

The nav bar is organized into three groups:
- **BD Tools**: Launchpad, Ops Tracker, Pipeline, Capture
- **Analysis**: Intel Hub, Financials
- **Platform**: QA Center, Doctrine, Prompts, Workflows, Settings

## Database

PostgreSQL 16 with 30+ tables. Managed via SQL migrations in `packages/backend/src/db/migrations/`.

```bash
# Start local Postgres (dev)
docker compose up -d

# Run migrations
cd packages/backend && npm run db:migrate

# Seed with mock data (300+ records)
cd packages/backend && npm run db:seed

# Full reset (drop + migrate + seed)
cd packages/backend && npm run db:reset
```

**Important**: The VM may have a system-level `DATABASE_URL` pointing elsewhere. Always start the backend with explicit override:
```bash
DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command npm run dev
```

## Production Deployment

### Docker Compose (recommended)

```bash
# 1. Copy and configure production environment
cp .env.production.example .env.production
# Edit .env.production — set POSTGRES_PASSWORD and JWT_SECRET

# 2. Build and start all services
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 3. Run seed (first deploy only)
docker exec gda-backend node packages/backend/dist/db/seed.js
```

The production stack runs:
- **postgres** — PostgreSQL 16 with health checks
- **backend** — Node.js API server (port 3001, internal only)
- **frontend** — Nginx serving React SPA + reverse proxy to backend (port 80)

Auto-migration runs on container startup. Set `AUTO_MIGRATE=false` to disable.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_PASSWORD` | Yes | — | PostgreSQL password |
| `JWT_SECRET` | Yes | — | JWT signing secret (`openssl rand -hex 32`) |
| `POSTGRES_USER` | No | `gda` | PostgreSQL username |
| `POSTGRES_DB` | No | `gda_command` | PostgreSQL database name |
| `APP_PORT` | No | `80` | Port the frontend is exposed on |
| `N8N_BASE_URL` | No | — | n8n instance URL for webhook integration |
| `N8N_API_BASE` | No | — | n8n REST API base URL |
| `N8N_API_KEY` | No | — | n8n API key |
| `AUTO_MIGRATE` | No | `true` | Run DB migrations on startup |
| `AUTO_SEED` | No | `false` | Run DB seed on startup |

### Health Checks

- Backend: `GET /health` — returns status, uptime, DB connection, config
- Frontend: `GET /` — nginx serves the SPA

## Type Checking

```bash
npm run typecheck   # Checks all workspaces
```
