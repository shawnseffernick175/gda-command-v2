/**
 * Regression test for F-011: missing migration files.
 *
 * Scans the migrations directory and verifies there are no gaps in the
 * numeric prefix sequence. A gap means a migration was applied to production
 * but the file was deleted or never committed — fresh deploys silently skip
 * whatever that migration did.
 *
 * This test catches the class of bug where schema_migrations references a
 * file that doesn't exist in the repo.
 *
 * Run: npx tsx packages/backend/src/db/test-migration-completeness.ts
 */

import fs from "fs";
import path from "path";

const migrationsDir = path.join(__dirname, "migrations");
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// Extract the base numeric prefix (digits only, no letter suffix)
// e.g., "036b_vehicle_classification.sql" → 36
function getBaseNumber(filename: string): number {
  const match = filename.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : -1;
}

// Get all base numbers and find the range
const numbers = files.map(getBaseNumber).filter((n) => n >= 0);
const uniqueNumbers = [...new Set(numbers)].sort((a, b) => a - b);

if (uniqueNumbers.length === 0) {
  process.stderr.write("[FAIL] No migration files found.\n");
  process.exit(1);
}

const min = uniqueNumbers[0];
const max = uniqueNumbers[uniqueNumbers.length - 1];

// Check for gaps (missing numbers in the sequence)
const gaps: number[] = [];
for (let i = min; i <= max; i++) {
  if (!uniqueNumbers.includes(i)) {
    gaps.push(i);
  }
}

if (gaps.length > 0) {
  process.stderr.write(
    `[FAIL] Missing migration number(s): ${gaps.map((g) => String(g).padStart(3, "0")).join(", ")}\n` +
    `Range: ${String(min).padStart(3, "0")} to ${String(max).padStart(3, "0")}\n` +
    `Found: ${uniqueNumbers.length} unique numbers, expected ${max - min + 1}\n\n` +
    "Every migration number in the sequence must have a corresponding .sql file.\n" +
    "If a migration was deleted, reconstruct it or add a no-op placeholder.\n",
  );
  process.exit(1);
} else {
  process.stdout.write(
    `[PASS] All ${uniqueNumbers.length} migration numbers present (${String(min).padStart(3, "0")}–${String(max).padStart(3, "0")}), no gaps.\n`,
  );
}
