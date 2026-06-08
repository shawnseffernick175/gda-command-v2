/**
 * Migration test for v3_065 (doctrine ID type fix, F-602).
 *
 * Self-contained: creates minimal doctrine_evaluations and agent_decisions
 * tables with the ORIGINAL UUID-typed columns, applies v3_065, then asserts
 * the three columns are now TEXT.
 *
 * This guards against the "recorded but not executed" bug where the migration
 * tracker shows the migration as applied while the schema change never
 * happened.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env['DATABASE_URL'] ??=
  'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';

const DB_URL = process.env['DATABASE_URL']!;
const { Pool } = pg;

let pool: InstanceType<typeof Pool>;

function loadSql(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf-8');
}

interface ColumnInfo {
  data_type: string;
}

describe('v3_065 doctrine ID type fix -- column type assertions', () => {
  const migrationSql = loadSql(
    '../../migrations/v3_065_doctrine_id_types.sql',
  );

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL, max: 3 });

    // Create minimal tables with the ORIGINAL UUID-typed columns
    // (mirrors v3_019_doctrine_rules.sql schema before the fix).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doctrine_evaluations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_kind TEXT NOT NULL,
        entity_id UUID NOT NULL,
        principle_scores JSONB NOT NULL DEFAULT '{}',
        alignment_total INT NOT NULL DEFAULT 0,
        evaluated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS agent_decisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        opportunity_id UUID,
        entity_id UUID,
        kind TEXT NOT NULL DEFAULT 'override',
        rationale TEXT NOT NULL DEFAULT '',
        decided_by TEXT NOT NULL DEFAULT 'test',
        decided_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Apply the migration
    await pool.query(migrationSql);
  });

  afterAll(async () => {
    // Clean up test tables
    if (pool) {
      await pool
        .query(
          'DROP TABLE IF EXISTS agent_decisions; DROP TABLE IF EXISTS doctrine_evaluations;',
        )
        .catch(() => {});
      await pool.end();
    }
  });

  it('doctrine_evaluations.entity_id is TEXT', async () => {
    const res = await pool.query<ColumnInfo>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'doctrine_evaluations' AND column_name = 'entity_id'`,
    );
    expect(res.rows.length).toBe(1);
    expect(res.rows[0]!.data_type).toBe('text');
  });

  it('agent_decisions.entity_id is TEXT', async () => {
    const res = await pool.query<ColumnInfo>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'agent_decisions' AND column_name = 'entity_id'`,
    );
    expect(res.rows.length).toBe(1);
    expect(res.rows[0]!.data_type).toBe('text');
  });

  it('agent_decisions.opportunity_id is TEXT', async () => {
    const res = await pool.query<ColumnInfo>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'agent_decisions' AND column_name = 'opportunity_id'`,
    );
    expect(res.rows.length).toBe(1);
    expect(res.rows[0]!.data_type).toBe('text');
  });
});
