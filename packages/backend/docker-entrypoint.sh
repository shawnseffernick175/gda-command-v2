#!/bin/sh
set -e

echo "[GDA Backend] Starting with NODE_ENV=$NODE_ENV"

# Run migrations if AUTO_MIGRATE is set (default: true for first deploy)
if [ "${AUTO_MIGRATE:-true}" = "true" ]; then
  echo "[GDA Backend] Running database migrations..."
  node packages/backend/dist/db/migrate.js
  echo "[GDA Backend] Migrations complete"
fi

# Run seed if AUTO_SEED is set (default: false)
if [ "${AUTO_SEED:-false}" = "true" ]; then
  echo "[GDA Backend] Running database seed..."
  node packages/backend/dist/db/seed.js
  echo "[GDA Backend] Seed complete"
fi

echo "[GDA Backend] Starting server..."
exec node packages/backend/dist/server.js
