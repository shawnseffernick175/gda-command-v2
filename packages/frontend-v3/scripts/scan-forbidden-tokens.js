#!/usr/bin/env node
/**
 * Forbidden-tokens scanner per D5 §7.4.
 * Scans packages/frontend-v3/src/** for violations.
 * Exits non-zero on violations with file + line refs.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, relative, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC_DIR = resolve(ROOT, 'src');

const ALLOWLIST = [
  'src/lib/echarts-theme.ts',
  'src/styles/tokens.css',
  'src/lib/tokens.ts',
  'src/app.css',
];

const ALLOWLIST_DIRS = [
  'design-tokens',
];

const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;
const BOX_SHADOW_PATTERN = /box-shadow\s*:/gi;
const FORBIDDEN_LIBS = ['recharts', 'chart.js', 'react-chartjs-2', 'nivo', 'victory', 'react-vis'];
const FORBIDDEN_LIB_PATTERN = new RegExp(`from\\s+['"](?:${FORBIDDEN_LIBS.join('|')})['"]`, 'g');

function isAllowlisted(filePath) {
  const rel = relative(ROOT, filePath);
  if (ALLOWLIST.some((a) => rel === a || rel.startsWith(a))) return true;
  if (ALLOWLIST_DIRS.some((d) => rel.startsWith(d))) return true;
  // Test files exempt
  if (rel.includes('__tests__') || rel.includes('.test.') || rel.includes('.spec.') || rel.includes('.stories.')) return true;
  return false;
}

function hasGuardrailIgnore(content) {
  const firstLines = content.split('\n').slice(0, 5).join('\n');
  return firstLines.includes('VISUAL_GUARDRAIL_IGNORE');
}

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      results.push(...walk(full));
    } else {
      const ext = extname(full);
      if (['.ts', '.tsx', '.css'].includes(ext)) {
        results.push(full);
      }
    }
  }
  return results;
}

let violations = 0;

const files = walk(SRC_DIR);
for (const file of files) {
  if (isAllowlisted(file)) continue;

  const content = readFileSync(file, 'utf-8');
  if (hasGuardrailIgnore(content)) continue;

  const lines = content.split('\n');
  const rel = relative(ROOT, file);

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    // Skip comment-only lines
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

    // Hex check
    let match;
    HEX_PATTERN.lastIndex = 0;
    while ((match = HEX_PATTERN.exec(line)) !== null) {
      console.log(`  ❌ ${rel}:${lineNum}`);
      console.log(`     Forbidden hex color: ${match[0]}`);
      violations++;
    }

    // box-shadow check
    BOX_SHADOW_PATTERN.lastIndex = 0;
    if (BOX_SHADOW_PATTERN.test(line)) {
      console.log(`  ❌ ${rel}:${lineNum}`);
      console.log(`     Forbidden box-shadow declaration`);
      violations++;
    }

    // Forbidden lib imports
    FORBIDDEN_LIB_PATTERN.lastIndex = 0;
    while ((match = FORBIDDEN_LIB_PATTERN.exec(line)) !== null) {
      console.log(`  ❌ ${rel}:${lineNum}`);
      console.log(`     Forbidden chart library import: ${match[0]}`);
      violations++;
    }
  });
}

if (violations > 0) {
  console.log(`\n  ${violations} violation(s) found. All colors must use design tokens.`);
  process.exit(1);
} else {
  console.log('  ✓ No forbidden tokens found.');
  process.exit(0);
}
