/**
 * Forbidden-tokens scanner per D5 §7.4
 * Scans packages/frontend-v3/src/** for violations.
 * Exits non-zero on violations.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, relative } from "path";

const SCRIPT_DIR = new URL(import.meta.url).pathname;
const PKG_ROOT = resolve(SCRIPT_DIR, "../..");
const ROOT = resolve(PKG_ROOT, "../..");
const SRC = resolve(PKG_ROOT, "src");

const ALLOWLIST = [
  "packages/frontend-v3/src/lib/echarts-theme.ts",
  "packages/frontend-v3/src/lib/tokens.ts",
  "packages/frontend-v3/src/styles/tokens.css",
];

const ALLOWLIST_ABS = ALLOWLIST.map((p) => resolve(ROOT, p));

const FORBIDDEN_LIBS = ["recharts", "chart.js", "react-chartjs-2", "nivo", "victory", "react-vis", "d3"];
const HEX_REGEX = /#[0-9a-fA-F]{3,8}\b/g;
const BOX_SHADOW_REGEX = /box-shadow\s*:/gi;

interface Violation {
  file: string;
  line: number;
  message: string;
}

function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      results.push(...walk(full));
    } else if (/\.(ts|tsx|css)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

function isAllowlisted(filePath: string): boolean {
  if (ALLOWLIST_ABS.some((a) => filePath === a)) return true;
  if (filePath.includes("design-tokens")) return true;
  // Check first 5 lines for VISUAL_GUARDRAIL_IGNORE marker
  try {
    const content = readFileSync(filePath, "utf-8");
    const firstLines = content.split("\n").slice(0, 5).join("\n");
    if (firstLines.includes("VISUAL_GUARDRAIL_IGNORE")) return true;
  } catch { /* noop */ }
  return false;
}

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.(ts|tsx)$/.test(filePath) || filePath.includes("__tests__");
}

const violations: Violation[] = [];
const files = walk(SRC);

for (const file of files) {
  if (isAllowlisted(file) || isTestFile(file)) continue;

  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  const relPath = relative(ROOT, file);

  lines.forEach((line, idx) => {
    // Check hex colors
    const hexMatches = line.match(HEX_REGEX);
    if (hexMatches) {
      for (const hex of hexMatches) {
        violations.push({
          file: relPath,
          line: idx + 1,
          message: `Forbidden hex color: ${hex}`,
        });
      }
    }

    // Check box-shadow
    if (BOX_SHADOW_REGEX.test(line)) {
      violations.push({
        file: relPath,
        line: idx + 1,
        message: "Forbidden box-shadow declaration",
      });
      BOX_SHADOW_REGEX.lastIndex = 0;
    }

    // Check forbidden libs
    for (const lib of FORBIDDEN_LIBS) {
      if (line.includes(`"${lib}"`) || line.includes(`'${lib}'`) || line.includes(`from "${lib}`) || line.includes(`from '${lib}`)) {
        violations.push({
          file: relPath,
          line: idx + 1,
          message: `Forbidden library import: ${lib}`,
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error("");
  for (const v of violations) {
    console.error(`  ❌ ${v.file}:${v.line}`);
    console.error(`     ${v.message}`);
    console.error("");
  }
  console.error(`  ${violations.length} violation(s) found. All colors must use design tokens.`);
  process.exit(1);
} else {
  console.log("✓ No forbidden token violations found.");
  process.exit(0);
}
