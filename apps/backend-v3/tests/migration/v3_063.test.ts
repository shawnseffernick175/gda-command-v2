/**
 * Migration test for v3_063: canonical pipeline stages.
 *
 * Validates:
 * - Old stage values are mapped to canonical keys
 * - New CHECK constraint accepts all 9 canonical keys
 * - Default is 'interest'
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

describe('v3_063 canonical pipeline stages migration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL, max: 3 });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('CHECK constraint accepts all 9 canonical keys', async () => {
    const canonical = [
      'interest', 'qualify', 'pursue', 'solicitation', 'post_submittal',
      'won', 'lost', 'no_bid', 'gov_cancelled',
    ];

    // Read constraint info from DB
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

  it('column default is interest', async () => {
    const defaultRes = await pool.query<{ column_default: string }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'pipeline_items' AND column_name = 'stage'`,
    );
    expect(defaultRes.rows.length).toBe(1);
    expect(defaultRes.rows[0]!.column_default).toContain('interest');
  });

  it('old stage values do not exist after migration', async () => {
    const oldValues = ['qualifying', 'pursuit', 'proposal', 'submitted', 'evaluation'];
    const res = await pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM pipeline_items WHERE stage = ANY($1)`,
      [oldValues],
    );
    expect(res.rows[0]!.cnt).toBe(0);
  });
});
