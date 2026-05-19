/**
 * Regression test for F-010: duplicate migration numbers.
 *
 * Scans the migrations directory and fails if any two files share the same
 * numeric prefix. This prevents the undefined-ordering bug that caused
 * fresh deploys to apply migrations in unpredictable order.
 *
 * Run: npx tsx packages/backend/src/db/test-unique-migration-numbers.ts
 */

import fs from "fs";
import path from "path";

const migrationsDir = path.join(__dirname, "migrations");
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// Extract numeric prefix including optional letter suffix
// e.g., "036_company_entities.sql" → "036"
//       "036b_vehicle_classification.sql" → "036b"
function getPrefix(filename: string): string {
  const match = filename.match(/^(\d+[a-z]?)/);
  return match ? match[1] : filename;
}

const prefixMap = new Map<string, string[]>();
for (const file of files) {
  const prefix = getPrefix(file);
  const existing = prefixMap.get(prefix) ?? [];
  existing.push(file);
  prefixMap.set(prefix, existing);
}

let failed = false;
for (const [prefix, filenames] of prefixMap) {
  if (filenames.length > 1) {
    process.stderr.write(
      `[FAIL] Duplicate migration prefix "${prefix}":\n` +
      filenames.map((f) => `  - ${f}`).join("\n") + "\n"
    );
    failed = true;
  }
}

if (failed) {
  process.stderr.write(
    "\nEvery migration file must have a unique numeric prefix.\n" +
    "Use the next available number when adding a new migration.\n"
  );
  process.exit(1);
} else {
  process.stdout.write(
    `[PASS] All ${files.length} migration files have unique prefixes.\n`
  );
}
