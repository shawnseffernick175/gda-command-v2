# GDA Command — Backend V3

Express/Fastify backend for GDA Command v2. Handles opportunity ingestion, doctrine evaluation, pipeline management, and AI-driven analysis.

## Quick Start

```bash
# From repo root
npm install

# Start Postgres
docker compose -f docker-compose.prod.yml up -d postgres

# Run migrations
cd apps/backend-v3
DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command npx tsx src/lib/migrate.ts

# Dev server
npm run dev
```

## Migrations

SQL migration files live in `migrations/` and are managed by `node-pg-migrate`. Files follow the naming convention `v3_NNN_<description>.sql`.

```bash
# Apply all pending migrations
npm run db:migrate

# Dry-run (shows what would apply)
npm run db:migrate:dry-run
```

## Data Model — Unified Opportunities (F-401)

The unified opportunity model consolidates records from all sources (SAM, GovTribe, GovWin, NSF, SBIR, etc.) into a single canonical representation. This replaces per-source silos with a source-agnostic graph.

### Tables

| Table | Purpose |
|-------|---------|
| `opportunities` | Canonical opportunity records with lifecycle stage, agency, NAICS, due dates, pwin, and doctrine status. |
| `opportunity_links` | Maps source-native IDs (e.g. SAM notice ID, GovTribe ID) to a single `internal_id`. Tracks match confidence and method. |
| `opportunity_field_overrides` | Per-field overrides set by users or system agents. Latest override wins (UNIQUE on internal_id + field_name). |
| `opportunity_signals` | Upstream signals (NSF awards, SBIR topics, arXiv papers, Fed Register rules) associated with an opportunity. |

### Lifecycle Stages

```
signal → forecast → pre_sol → solicitation → awarded → post_award → closed
```

### Key Design Decisions

- **UUID primary keys** (`internal_id`) — decoupled from any source's native ID scheme.
- **Multi-source linking** — one opportunity can have links from SAM, GovTribe, GovWin, etc. simultaneously.
- **Confidence scoring** on links — enables a review queue for fuzzy-matched records.
- **Field overrides** — user corrections persist without mutating the base record.
- **Existing per-source tables are untouched** — backfill happens in F-404.

### Repository

`src/db/repos/OpportunityRepo.ts` provides:

- `create` / `findById` / `update` / `delete` — standard CRUD
- `findByLink(source, sourceNativeId)` — resolves a source-native ID to the canonical opportunity
- `findStage(stage, opts)` — filters by lifecycle stage with optional agency/NAICS/due-date filters
- `createLink` / `findLinksByInternalId` — link management
- `setFieldOverride` / `getFieldOverrides` — upsert overrides
- `addSignal` / `getSignals` — signal associations

### TypeScript Types

All types are in `src/db/types/opportunity.ts`:

- `Opportunity`, `OpportunityInsert`, `OpportunityUpdate`
- `OpportunityLink`, `OpportunityLinkInsert`
- `OpportunityFieldOverride`, `OpportunityFieldOverrideInsert`
- `OpportunitySignal`, `OpportunitySignalInsert`
- Enums: `LifecycleStage`, `LinkConfidence`, `DoctrineStatus`, `PrimarySource`, `SignalType`, `MatchMethod`

## Testing

```bash
# Unit tests
npm run test

# Integration tests (requires Docker for testcontainers)
npm run test:integration
```

## Scripts

| Script | Description |
|--------|-------------|
| `dev` | Start dev server with hot reload |
| `build` | TypeScript compile |
| `lint` | ESLint |
| `typecheck` | `tsc --noEmit` |
| `test` | Vitest unit tests |
| `test:integration` | Vitest integration tests (testcontainers) |
| `db:migrate` | Apply pending migrations |
| `db:migrate:dry-run` | Preview pending migrations |
