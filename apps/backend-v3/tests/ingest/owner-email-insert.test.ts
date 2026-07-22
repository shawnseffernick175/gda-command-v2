/**
 * Regression guard for #1142 BUG A.
 *
 * The ingest triage path inserted into action_items WITHOUT owner_email, but the
 * column is NOT NULL, so every financial upload threw "23502 null value in
 * column owner_email" (swallowed as a warn, surfaced to the user as an upload
 * failure). This test reads the router source and asserts the action_items
 * INSERT lists owner_email and that its column/placeholder counts stay balanced,
 * so the omission can never silently return.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routerSrc = readFileSync(
  join(__dirname, '../../src/services/ingest/router.ts'),
  'utf-8',
);

describe('ingest router action_items INSERT — owner_email present (Bug A)', () => {
  const insertMatch = routerSrc.match(/INSERT INTO action_items \(([^)]*)\)\s*\n\s*VALUES \(([^)]*)\)/);

  it('has an INSERT INTO action_items statement', () => {
    expect(insertMatch).not.toBeNull();
  });

  it('includes owner_email in the column list', () => {
    const columns = insertMatch![1];
    expect(columns).toContain('owner_email');
  });

  it('column count matches VALUES placeholder count', () => {
    const columns = insertMatch![1].split(',').map((c) => c.trim()).filter(Boolean);
    const values = insertMatch![2].split(',').map((v) => v.trim()).filter(Boolean);
    expect(values.length).toBe(columns.length);
  });

  it('derives owner_email from the uploader with a system fallback', () => {
    expect(routerSrc).toMatch(/uploaderEmail\s*(:|=)/);
    expect(routerSrc).toContain('ingest-system@gda.local');
  });
});
