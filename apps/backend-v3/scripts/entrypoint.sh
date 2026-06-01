#!/bin/sh
# GDA Backend V3 — Docker entrypoint
# Runs forward-only SQL migrations before starting the Node.js server.
# If migrations fail the container exits 1 so orchestrators can react.

set -e

echo "[entrypoint] Running V3 schema migrations …"

# The migrate runner lives at db/v3/migrate.ts but the Docker image ships the
# compiled JS under dist/. We bundle a compiled copy at db/v3/migrate.mjs for
# the runtime stage (no tsx in prod image).
node /app/db/v3/migrate.mjs

echo "[entrypoint] Migrations complete — starting backend"
exec node /app/apps/backend-v3/dist/server.js
