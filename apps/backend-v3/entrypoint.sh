#!/bin/sh
set -e

echo "=== GDA Backend V3 — Container Entrypoint ==="

# Run schema migrations BEFORE starting the server.
# Uses node-pg-migrate to apply any pending SQL migrations.
echo "[entrypoint] Running schema migrations..."
node apps/backend-v3/dist/lib/migrate.js || {
  echo "[entrypoint] ERROR: Migrations failed — aborting startup."
  exit 1
}
echo "[entrypoint] Migrations complete."

# Start the backend server.
echo "[entrypoint] Starting server..."
exec node apps/backend-v3/dist/server.js
