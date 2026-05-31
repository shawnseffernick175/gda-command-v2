# V3 Architecture

## Backend layout (canonical)

The ONLY backend is `apps/backend-v3/`. There is no `packages/backend/`. Any code adding endpoints, cron jobs, ingestion, workers, or routes goes under `apps/backend-v3/src/`. The frontend is `packages/frontend-v3/`. All Devin work must respect these paths.
