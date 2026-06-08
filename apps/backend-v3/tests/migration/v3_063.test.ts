/**
 * Migration test for v3_063: canonical pipeline stages.
 *
 * Self-contained: loads the old pipeline_items schema from a SQL fixture,
 * seeds rows at old stages, applies the migration, then asserts:
 * - Old stage values remapped to canonical keys
 * - Column default is 'interest'
 * - New CHECK accepts all 9 canonical keys
 * - New CHECK rejects bogus values
 *
 * No CREATE TABLE in this file -- old schema lives in fixtures/pipeline_items_old_schema.sql.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';

const DB_URL = process.env['DATABASE_URL']!;
const { Pool } = pg;

let pool: InstanceType<typeof Pool>;

function loadSql(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf-8');
}

describe('v3_063 canonical pipeline stages migration', () => {
  const fixtureSql = loadSql('./fixtures/pipeline_items_old_schema.sql');
  const migrationSql = loadSql('../../migrations/v3_063_canonical_pipeline_stages.sql');

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL, max: 3 });

    // Set up old schema + seed data from fixture
    await pool.query(fixtureSql);

    // Apply the migration
    await pool.query(migrationSql);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('remaps qualifying to interest', async () => {
    const res = await pool.query<{ stage: string }>(
      'SELECT stage FROM pipeline_items WHERE opportunity_id = 1',
    );
    expect(res.rows[0]!.stage).toBe('interest');
  });

  it('remaps pursuit to qualify', async () => {
    const res = await pool.query<{ stage: string }>(
      'SELECT stage FROM pipeline_items WHERE opportunity_id = 2',
    );
    expect(res.rows[0]!.stage).toBe('qualify');
  });

  it('remaps proposal to pursue', async () => {
    const res = await pool.query<{ stage: string }>(
      'SELECT stage FROM pipeline_items WHERE opportunity_id = 3',
    );
    expect(res.rows[0]!.stage).toBe('pursue');
  });

  it('remaps submitted to post_submittal', async () => {
    const res = await pool.query<{ stage: string }>(
      'SELECT stage FROM pipeline_items WHERE opportunity_id = 4',
    );
    expect(res.rows[0]!.stage).toBe('post_submittal');
  });

  it('remaps evaluation to post_submittal', async () => {
    const res = await pool.query<{ stage: string }>(
      'SELECT stage FROM pipeline_items WHERE opportunity_id = 5',
    );
    expect(res.rows[0]!.stage).toBe('post_submittal');
  });

  it('preserves won and lost as-is', async () => {
    const won = await pool.query<{ stage: string }>(
      'SELECT stage FROM pipeline_items WHERE opportunity_id = 6',
    );
    expect(won.rows[0]!.stage).toBe('won');

    const lost = await pool.query<{ stage: string }>(
      'SELECT stage FROM pipeline_items WHERE opportunity_id = 7',
    );
    expect(lost.rows[0]!.stage).toBe('lost');
  });

  it('column default is interest', async () => {
    const res = await pool.query<{ column_default: string }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'pipeline_items' AND column_name = 'stage'`,
    );
    expect(res.rows.length).toBe(1);
    expect(res.rows[0]!.column_default).toContain('interest');
  });

  it('CHECK constraint accepts all 9 canonical keys', async () => {
    const canonical = [
      'interest', 'qualify', 'pursue', 'solicitation', 'post_submittal',
      'won', 'lost', 'no_bid', 'gov_cancelled',
    ];

    const constraintRes = await pool.query<{ consrc: string }>(
      `SELECT pg_get_constraintdef(oid) AS consrc
       FROM pg_constraint
       WHERE conrelid = 'pipeline_items'::regclass
         AND conname = 'pipeline_items_stage_check'`,
    );
    expect(constraintRes.rows.length).toBe(1);

    const constraintDef = constraintRes.rows[0]!.consrc;
    for (const key of canonical) {
      expect(constraintDef).toContain(`'${key}'`);
    }
  });

  it('CHECK constraint rejects bogus stage value', async () => {
    await expect(
      pool.query(
        `INSERT INTO pipeline_items (opportunity_id, capture_owner, stage, source_id)
         VALUES (99, 'user-x', 'bogus', 1)`,
      ),
    ).rejects.toThrow();
  });

  it('no old stage values remain after migration', async () => {
    const oldValues = ['qualifying', 'pursuit', 'proposal', 'submitted', 'evaluation'];
    const res = await pool.query<{ cnt: number }>(
      'SELECT COUNT(*)::int AS cnt FROM pipeline_items WHERE stage = ANY($1)',
      [oldValues],
    );
    expect(res.rows[0]!.cnt).toBe(0);
  });
});
