# Backend V3 — Integration Tests

Real-Postgres integration tests using [testcontainers](https://node.testcontainers.org/).

## Prerequisites

- **Docker** — testcontainers boots a Postgres 16 container on a random port.
- **Node 22+** and `npm ci` at the repo root.

## Running locally

```bash
# From repo root
npm run test:integration --workspace=@gda/backend-v3

# Or from apps/backend-v3
cd apps/backend-v3
npm run test:integration
```

The suite will:

1. Boot a Postgres 16 container (~5 s cold, ~1 s warm).
2. Run all `db/v3/migrations/*.sql` files in order.
3. Seed minimal fixtures (1 source, 1 opportunity, 1 pipeline item, 1 capture, 1 action item, 1 partner).
4. Hit every V3 endpoint with a real JWT and assert status + shape.
5. Run worker round-trip tests (analysis, capture, fast-track, drafts).
6. Tear down the container.

Typical wall time: **30–60 s** (first run pulls the Docker image).

## Schema audit

```bash
npm run audit:schema --workspace=@gda/backend-v3
```

The audit script (`tests/audit-schema.ts`) statically extracts column names
from SQL strings in `src/routes/*.ts` and `src/workers/*.ts`, then compares
them against `information_schema.columns` in the test Postgres. It fails the
build if any referenced column is missing from the DB schema.

> The audit script requires `DATABASE_URL` to point at a migrated Postgres.
> In CI it runs after the integration tests (which leave the container up).
> Locally, run `test:integration` first and set `DATABASE_URL` to the
> container's connection string, or use the script in the CI job.

## Configuration

| File | Purpose |
|---|---|
| `vitest.integration.config.ts` | Vitest config: 60 s timeout, serial execution, `globalSetup` boots container |
| `tests/integration/setup.ts` | Container lifecycle (start / stop) |
| `tests/integration/migrate.ts` | Runs `db/v3/migrations/*.sql` in order |
| `tests/integration/seed.ts` | Minimal fixtures |
| `tests/integration/helpers.ts` | JWT minting, shared pool + app |

## CI

The `backend-v3-ci.yml` workflow runs:

1. **unit** — existing vitest unit tests.
2. **integration** (requires unit) — boots testcontainer, runs endpoint + worker tests, then runs the schema audit.

Both jobs use `ubuntu-latest` with Docker pre-installed.
