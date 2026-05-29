#!/usr/bin/env node
/**
 * check-visual-tokens.mjs
 *
 * CI guardrail: fails the build if any file under packages/frontend/src/
 * (or packages/frontend/index.html) contains forbidden visual tokens that
 * contradict the F-100 aesthetics_canonical_v1 design system.
 *
 * Add `// VISUAL_GUARDRAIL_IGNORE` on one of the first 5 lines of a file
 * to opt that file out (use sparingly — for legacy shims only).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Forbidden token patterns ──────────────────────────────────────────────

/** Forbidden hex color literals (case-insensitive). */
const FORBIDDEN_HEX = [
  '#0f1117',
  '#1a1d27',
  '#22262f',
  '#2a2e3a',
  '#e4e4e7',
  '#9ca3af',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
];

/**
 * Forbidden font-family declarations.
 * "monospace" is only forbidden when used as a body/font-family value.
 * tabular-nums is explicitly allowed and never matched here.
 */
const FORBIDDEN_FONT_PATTERNS = [
  // Catches: font-family: 'JetBrains Mono', font-family: "JetBrains Mono", fontFamily: 'JetBrains Mono', etc.
  /font-?family\s*[=:]\s*['"]?[^'";{}\n]*JetBrains\s+Mono/i,
  /font-?family\s*[=:]\s*['"]?[^'";{}\n]*Fira\s+Code/i,
  // monospace as a body font-family value — excludes tabular-nums context
  // Matches: font-family: monospace, font-family: 'monospace', fontFamily: "monospace"
  // Does NOT match: font-variant-numeric: tabular-nums
  /font-?family\s*[=:]\s*['"]?[^'";{}\n]*\bmonospace\b/i,
];

/**
 * Inline style props that set color / background / font-family.
 * Catches JSX style={{ color: ... }}, style={{ fontFamily: ... }}, etc.
 */
const INLINE_STYLE_PATTERN =
  /style=\{[^}]*(color|background|font-family|fontFamily)\s*:/;

/** Forbidden legacy CSS class names (as string literals, className, or CSS selectors). */
const FORBIDDEN_CLASSES = [
  'kpi-grid',
  'signal-grid',
  'funnel-row',
  'funnel-label',
  'funnel-value',
  'funnel-pwin',
  'summary-strip',
  'field-grid',
  'quick-access-grid',
  'sidebar-overlay',
  'mobile-header',
  'two-column-layout',
];

// Pre-compile hex patterns (case-insensitive)
const hexPatterns = FORBIDDEN_HEX.map((hex) => ({
  label: `Forbidden hex color: ${hex}`,
  regex: new RegExp(hex.replace('#', '#'), 'i'),
}));

// Build class pattern — matches the class name as a whole word / quoted string / selector
const classPatterns = FORBIDDEN_CLASSES.map((cls) => ({
  label: `Forbidden legacy class: .${cls}`,
  // Matches: "kpi-grid", 'kpi-grid', className="kpi-grid", .kpi-grid { , kpi-grid (bare word boundary)
  regex: new RegExp(`['"\\s.]${cls}['"\\s{>]|\\b${cls}\\b`),
}));

const fontPatterns = FORBIDDEN_FONT_PATTERNS.map((r, i) => ({
  label: [
    'Forbidden font-family: JetBrains Mono',
    'Forbidden font-family: Fira Code',
    'Forbidden font-family: monospace (body)',
  ][i],
  regex: r,
}));

const inlineStylePattern = {
  label: 'Forbidden inline color/font style prop',
  regex: INLINE_STYLE_PATTERN,
};

/** All checks in priority order */
const ALL_CHECKS = [
  ...hexPatterns,
  ...fontPatterns,
  inlineStylePattern,
  ...classPatterns,
];

// ─── File collection ───────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.git']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

/**
 * Skip files that define the canonical token list itself
 * (aesthetics_canonical_v1.md and similar docs).
 */
function isCanonicalDoc(filePath) {
  return filePath.includes('aesthetics_canonical_v1');
}

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
    if (entry.isDirectory()) {
      collectFiles(full, files);
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function targetFiles() {
  const srcDir = path.join(ROOT, 'packages', 'frontend', 'src');
  const indexHtml = path.join(ROOT, 'packages', 'frontend', 'index.html');

  const files = [];

  if (fs.existsSync(srcDir)) {
    collectFiles(srcDir, files);
  }

  if (fs.existsSync(indexHtml)) {
    files.push(indexHtml);
  }

  return files.filter((f) => !isCanonicalDoc(f));
}

// ─── Ignore marker ─────────────────────────────────────────────────────────

const IGNORE_MARKER = 'VISUAL_GUARDRAIL_IGNORE';

function hasIgnoreMarker(lines) {
  const head = lines.slice(0, 5).join('\n');
  return head.includes(IGNORE_MARKER);
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const files = targetFiles();
  let totalViolations = 0;
  const violationLines = [];

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error(`Could not read ${filePath}: ${err.message}`);
      continue;
    }

    const lines = content.split('\n');

    if (hasIgnoreMarker(lines)) {
      continue;
    }

    const rel = path.relative(ROOT, filePath);

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      for (const check of ALL_CHECKS) {
        if (check.regex.test(line)) {
          const trimmed = line.trim().slice(0, 120);
          const msg = `${rel}:${lineNum}: [${check.label}] in: ${trimmed}`;
          violationLines.push(msg);
          totalViolations++;
        }
      }
    });
  }

  if (totalViolations > 0) {
    console.error('\n\x1b[31m╔══ VISUAL GUARDRAIL FAILED ══════════════════════════════════════╗\x1b[0m');
    console.error(`\x1b[31m║  ${totalViolations} forbidden visual token violation(s) found:\x1b[0m`);
    console.error('\x1b[31m╚═════════════════════════════════════════════════════════════════╝\x1b[0m\n');
    for (const v of violationLines) {
      console.error(`  \x1b[33m•\x1b[0m ${v}`);
    }
    console.error(
      `\n\x1b[31mFailed:\x1b[0m ${totalViolations} violation(s). Use canonical tokens from aesthetics_canonical_v1.md.\n` +
      `        Add \`// ${IGNORE_MARKER}\` to the first 5 lines of a file only as a last resort.\n`
    );
    process.exit(1);
  } else {
    console.log(
      `\x1b[32m✓ Visual guardrail passed\x1b[0m — ${files.length} file(s) checked, 0 forbidden tokens found.`
    );
    process.exit(0);
  }
}

main();
