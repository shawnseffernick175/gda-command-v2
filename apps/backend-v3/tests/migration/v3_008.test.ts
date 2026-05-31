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

describe('v3_008_fast_track_assessments migration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL, max: 2 });

    // Drop the table if it exists (clean slate for migration test)
    await pool.query('DROP TABLE IF EXISTS fast_track_assessments CASCADE');

    // Apply migration
    const sql = readFileSync(
      resolve(__dirname, '../../../../db/v3/migrations/v3_008_fast_track_assessments.sql'),
      'utf-8',
    );
    await pool.query(sql);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should create fast_track_assessments table', async () => {
    const { rows } = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'fast_track_assessments'
    `);
    expect(rows).toHaveLength(1);
  });

  it('should have all expected columns', async () => {
    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fast_track_assessments'
      ORDER BY ordinal_position
    `);
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain('id');
    expect(cols).toContain('input_hash');
    expect(cols).toContain('title');
    expect(cols).toContain('description');
    expect(cols).toContain('naics_codes');
    expect(cols).toContain('set_aside');
    expect(cols).toContain('place_of_performance');
    expect(cols).toContain('grade');
    expect(cols).toContain('rationale');
    expect(cols).toContain('naics_match_score');
    expect(cols).toContain('recommended_action');
    expect(cols).toContain('source_chips');
    expect(cols).toContain('model_used');
    expect(cols).toContain('analysis_version');
    expect(cols).toContain('generated_at');
    expect(cols).toContain('created_at');
  });

  it('should have expected indexes', async () => {
    const { rows } = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'fast_track_assessments'
    `);
    const names = rows.map((r) => r.indexname);
    expect(names).toContain('idx_fast_track_input_hash');
    expect(names).toContain('idx_fast_track_generated');
    expect(names).toContain('idx_fast_track_grade');
  });

  it('should enforce grade CHECK constraint', async () => {
    await expect(
      pool.query(
        `INSERT INTO fast_track_assessments
           (input_hash, title, description, grade, rationale, naics_match_score,
            recommended_action, source_chips, model_used, analysis_version)
         VALUES ('h1','t','d','X','r',50,'watch','[]','m','v1')`,
      ),
    ).rejects.toThrow();
  });

  it('should enforce recommended_action CHECK constraint', async () => {
    await expect(
      pool.query(
        `INSERT INTO fast_track_assessments
           (input_hash, title, description, grade, rationale, naics_match_score,
            recommended_action, source_chips, model_used, analysis_version)
         VALUES ('h2','t','d','A','r',50,'invalid','[]','m','v1')`,
      ),
    ).rejects.toThrow();
  });

  it('should enforce naics_match_score range CHECK constraint', async () => {
    await expect(
      pool.query(
        `INSERT INTO fast_track_assessments
           (input_hash, title, description, grade, rationale, naics_match_score,
            recommended_action, source_chips, model_used, analysis_version)
         VALUES ('h3','t','d','A','r',101,'pursue','[]','m','v1')`,
      ),
    ).rejects.toThrow();
  });

  it('should enforce UNIQUE (input_hash, analysis_version)', async () => {
    await pool.query(
      `INSERT INTO fast_track_assessments
         (input_hash, title, description, grade, rationale, naics_match_score,
          recommended_action, source_chips, model_used, analysis_version)
       VALUES ('h-unique','t','d','B','r',50,'watch','[]','m','v1')`,
    );

    await expect(
      pool.query(
        `INSERT INTO fast_track_assessments
           (input_hash, title, description, grade, rationale, naics_match_score,
            recommended_action, source_chips, model_used, analysis_version)
         VALUES ('h-unique','t','d','A','r',80,'pursue','[]','m','v1')`,
      ),
    ).rejects.toThrow();
  });

  it('should accept valid inserts', async () => {
    const { rowCount } = await pool.query(
      `INSERT INTO fast_track_assessments
         (input_hash, title, description, grade, rationale, naics_match_score,
          recommended_action, source_chips, model_used, analysis_version)
       VALUES ('h-valid','Test Title','Test Desc','A','Good match',85,'pursue',
               '[{"label":"SAM","url":"https://sam.gov","kind":"sam_gov","retrieved_at":"2026-01-01T00:00:00Z"}]',
               'claude-sonnet-4-5','v0.0.1')`,
    );
    expect(rowCount).toBe(1);
  });
});
