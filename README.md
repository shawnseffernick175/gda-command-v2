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
| `/` | Launchpad (home) |
| `/qa-center` | QA Center — health checks & latest failures |
| `/ops-tracker` | Ops Tracker (placeholder) |
| `/pipeline` | Pipeline (placeholder) |

### Backend API
| Endpoint | Description |
|---|---|
| `GET /api/qa/health` | Platform health status with individual check results |
| `GET /api/qa/latest-failures` | Most recent workflow failures |

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
