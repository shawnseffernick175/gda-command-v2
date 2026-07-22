#!/bin/sh
set -e

# APP_ENTRYPOINT selects which process this container runs:
#   server.js (default) — HTTP API
#   worker.js          — pg-boss consumers + node-cron scheduler
APP_ENTRYPOINT="${APP_ENTRYPOINT:-server.js}"

echo "=== GDA Backend V3 — Container Entrypoint (${APP_ENTRYPOINT}) ==="

# Run schema migrations BEFORE starting. node-pg-migrate takes a pg advisory
# lock, so it is safe to run from both the API and the worker container
# concurrently — one applies, the other waits then sees nothing pending.
echo "[entrypoint] Running schema migrations..."
node apps/backend-v3/dist/lib/migrate.js || {
  echo "[entrypoint] ERROR: Migrations failed — aborting startup."
  exit 1
}
echo "[entrypoint] Migrations complete."

echo "[entrypoint] Starting ${APP_ENTRYPOINT}..."
exec node "apps/backend-v3/dist/${APP_ENTRYPOINT}"
