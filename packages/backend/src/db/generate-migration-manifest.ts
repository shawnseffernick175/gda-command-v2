/**
 * Generate migration-manifest.json — a mapping of migration filenames to
 * their SHA-256 content hashes. Used by migrate.ts for manifest verification.
 *
 * This script is run by CI at Docker image build time. The manifest is baked
 * into the image so the migration runner can verify file integrity at runtime.
 *
 * Usage: npx tsx src/db/generate-migration-manifest.ts
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const migrationsDir = path.join(__dirname, "migrations");
const outputPath = path.join(migrationsDir, "migration-manifest.json");

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const manifest: Record<string, string> = {};
for (const file of files) {
  const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
  manifest[file] = sha256(content);
}

fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + "\n");
process.stdout.write(
  `[manifest] generated ${outputPath} with ${files.length} entries\n`,
);
