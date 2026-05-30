// Fixture: simulates an anti-token test that checks forbidden strings
// never appear in module code. To search for them, it must embed them
// as string-literal needles. The gate MUST allow this.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const FORBIDDEN_NEEDLES = [
  'analysis_status',
  'stale: true',
  'stale: boolean',
  '"stale"',
  'analysis: null',
  '"not_yet_analyzed"',
  '"running"',
  '"pending"',
];

function collectFiles(dir: string, ext: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full, ext));
    } else if (full.endsWith(ext)) {
      files.push(full);
    }
  }
  return files;
}

describe('R2 anti-token gate', () => {
  const srcFiles = collectFiles('apps/backend-v3/src', '.ts');

  for (const needle of FORBIDDEN_NEEDLES) {
    it(`module code must not contain "${needle}"`, () => {
      for (const file of srcFiles) {
        const content = readFileSync(file, 'utf-8');
        expect(content).not.toContain(needle);
      }
    });
  }
});
