#!/bin/sh
set -e

echo "[GDA Backend] Starting with NODE_ENV=$NODE_ENV"

# Run migrations if AUTO_MIGRATE is set (default: true for first deploy)
# Migrations are non-fatal — the server should still start even if a
# migration fails (the route handlers degrade gracefully). This prevents
# the container from entering a restart loop on migration errors.
if [ "${AUTO_MIGRATE:-true}" = "true" ]; then
  echo "[GDA Backend] Running database migrations..."
  if node packages/backend/dist/db/migrate.js; then
    echo "[GDA Backend] Migrations complete"
  else
    echo "[GDA Backend] WARNING: Migrations failed (exit $?) — starting server anyway"
  fi
fi

# Run seed if AUTO_SEED is set (default: false)
if [ "${AUTO_SEED:-false}" = "true" ]; then
  echo "[GDA Backend] Running database seed..."
  node packages/backend/dist/db/seed.js || echo "[GDA Backend] WARNING: Seed failed"
  echo "[GDA Backend] Seed step done"
fi

echo "[GDA Backend] Starting server..."
exec node packages/backend/dist/server.js
