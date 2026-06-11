#!/usr/bin/env bash
set -euo pipefail

# --------------------------------------------------------------------------
# Schema drift CI guard
#
# 1. Dumps the staging DB schema (public tables + columns) to JSON.
# 2. Runs the compiled TypeScript checker against backend + frontend source.
# 3. Exits with the checker's exit code.
#
# Requires: DATABASE_URL env var pointing at the staging (or CI) database.
# --------------------------------------------------------------------------

SCHEMA_OUT="dist/schema-snapshot.json"
CHECKER="dist/scripts/check_schema_drift.js"
ALLOWLIST="scripts/ci/schema-drift-allowlist.txt"

# --- Step 1: dump schema to JSON -----------------------------------------

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set."
  exit 2
fi

echo "Dumping public schema from DATABASE_URL → $SCHEMA_OUT"

node -e "
const { Client } = require('pg');
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(
    \"SELECT table_name, column_name \" +
    \"FROM information_schema.columns \" +
    \"WHERE table_schema = 'public' \" +
    \"ORDER BY table_name, ordinal_position\"
  );
  await client.end();
  const schema = {};
  for (const r of rows) {
    const t = r.table_name;
    if (!schema[t]) schema[t] = [];
    schema[t].push(r.column_name);
  }
  const fs = require('fs');
  const path = require('path');
  fs.mkdirSync(path.dirname('$SCHEMA_OUT'), { recursive: true });
  fs.writeFileSync('$SCHEMA_OUT', JSON.stringify(schema, null, 2));
  console.log('Schema snapshot written: ' + Object.keys(schema).length + ' tables');
})().catch(err => { console.error(err); process.exit(1); });
"

# --- Step 2: run the compiled checker ------------------------------------

echo "Running schema drift checker..."

node "$CHECKER" \
  --schema "$SCHEMA_OUT" \
  --scan apps/backend-v3/src packages/frontend-v3/src \
  --allowlist "$ALLOWLIST"
