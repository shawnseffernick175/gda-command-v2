#!/usr/bin/env node
/**
 * check-font-floor.mjs
 *
 * CI guardrail: fails if any file under packages/frontend-v3/src uses a font
 * size below the 12px floor mandated by aesthetics_canonical_v1 (caption:
 * 12px minimum). Catches Tailwind arbitrary sizes (text-[Npx], text-[Nrem])
 * and ECharts/inline literal `fontSize: N`.
 *
 * Add `// FONT_FLOOR_IGNORE` on one of the first 5 lines of a file to opt it
 * out (use sparingly).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'packages', 'frontend-v3', 'src');

const MIN_PX = 12;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.git']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const IGNORE_MARKER = 'FONT_FLOOR_IGNORE';

const TW_PX = /text-\[(\d+(?:\.\d+)?)px\]/g;
const TW_REM = /text-\[(\d+(?:\.\d+)?)rem\]/g;
const FONT_SIZE = /fontSize:\s*(\d+(?:\.\d+)?)\b/g;

function collectFiles(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, files);
    else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function checkLine(line) {
  const hits = [];
  let m;
  TW_PX.lastIndex = 0;
  while ((m = TW_PX.exec(line))) if (parseFloat(m[1]) < MIN_PX) hits.push(`${m[0]} (${m[1]}px < ${MIN_PX}px)`);
  TW_REM.lastIndex = 0;
  while ((m = TW_REM.exec(line))) if (parseFloat(m[1]) * 16 < MIN_PX) hits.push(`${m[0]} (${parseFloat(m[1]) * 16}px < ${MIN_PX}px)`);
  FONT_SIZE.lastIndex = 0;
  while ((m = FONT_SIZE.exec(line))) if (parseFloat(m[1]) < MIN_PX) hits.push(`fontSize: ${m[1]} (< ${MIN_PX})`);
  return hits;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Source dir not found: ${SRC}`);
    process.exit(1);
  }
  const files = collectFiles(SRC);
  const violations = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    if (lines.slice(0, 5).join('\n').includes(IGNORE_MARKER)) continue;
    const rel = path.relative(ROOT, filePath);
    lines.forEach((line, idx) => {
      for (const hit of checkLine(line)) {
        violations.push(`${rel}:${idx + 1}: ${hit} — in: ${line.trim().slice(0, 120)}`);
      }
    });
  }

  if (violations.length > 0) {
    console.error(`\n\x1b[31mFONT FLOOR FAILED — ${violations.length} sub-${MIN_PX}px font size(s):\x1b[0m\n`);
    for (const v of violations) console.error(`  \x1b[33m•\x1b[0m ${v}`);
    console.error(`\nUse at least ${MIN_PX}px (canonical caption floor). Add \`// ${IGNORE_MARKER}\` to the first 5 lines only as a last resort.\n`);
    process.exit(1);
  }
  console.log(`\x1b[32m✓ Font floor passed\x1b[0m — ${files.length} file(s) checked, no sub-${MIN_PX}px fonts.`);
  process.exit(0);
}

main();
