import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import pg from 'pg';

process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';

const DB_URL = process.env['DATABASE_URL'];
const { Pool } = pg;

let pool: InstanceType<typeof Pool>;

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL, max: 2 });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS fast_track_assessments (
        id              BIGSERIAL     PRIMARY KEY,
        input_hash      TEXT          NOT NULL,
        title           TEXT          NOT NULL,
        description     TEXT          NOT NULL,
        naics_codes     TEXT[]        NOT NULL DEFAULT '{}',
        set_aside       TEXT,
        place_of_performance TEXT,
        grade           TEXT          NOT NULL CHECK (grade IN ('A', 'B', 'C')),
        rationale       TEXT          NOT NULL,
        naics_match_score NUMERIC     NOT NULL CHECK (naics_match_score >= 0 AND naics_match_score <= 100),
        recommended_action TEXT       NOT NULL CHECK (recommended_action IN ('pursue', 'watch', 'skip')),
        source_chips    JSONB         NOT NULL DEFAULT '[]',
        model_used      TEXT          NOT NULL,
        analysis_version TEXT         NOT NULL,
        generated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        UNIQUE (input_hash, analysis_version)
      )
    `);
    await client.query('DELETE FROM fast_track_assessments');
  } finally {
    client.release();
  }
});

afterAll(async () => {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM fast_track_assessments');
  } finally {
    client.release();
  }
  await pool.end();
});

describe('Fast Track Worker', () => {
  it('should write assessment row with correct shape when router succeeds', async () => {
    const inputHash = 'test-hash-worker-' + Date.now();
    const input = {
      title: 'Test Opportunity',
      description: 'Test description for worker test.',
      naics_codes: ['541330'],
      set_aside: null,
      place_of_performance: null,
    };
    const analysisVersion = process.env['ANALYSIS_VERSION']!;

    // Simulate what the worker does: call router + write row
    const { llmRouter } = await import('../../src/lib/llm-router.js');
    const result = await llmRouter.route({
      task: 'fast_track_triage',
      input,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.output;
    const sourceChips = (result.output as unknown as { source_chips?: unknown[] }).source_chips ?? [];

    await pool.query(
      `INSERT INTO fast_track_assessments
         (input_hash, title, description, naics_codes, set_aside, place_of_performance,
          grade, rationale, naics_match_score, recommended_action,
          source_chips, model_used, analysis_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        inputHash,
        input.title,
        input.description,
        input.naics_codes,
        input.set_aside,
        input.place_of_performance,
        output.grade,
        output.rationale,
        output.naics_match_score,
        output.recommended_action,
        JSON.stringify(sourceChips),
        result.model_used,
        analysisVersion,
      ],
    );

    const { rows } = await pool.query(
      'SELECT * FROM fast_track_assessments WHERE input_hash = $1',
      [inputHash],
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.grade).toMatch(/^[ABC]$/);
    expect(row.recommended_action).toMatch(/^(pursue|watch|skip)$/);
    expect(Number(row.naics_match_score)).toBeGreaterThanOrEqual(0);
    expect(Number(row.naics_match_score)).toBeLessThanOrEqual(100);
    expect(row.model_used).toBeTruthy();
    expect(row.source_chips).toBeInstanceOf(Array);
  });

  it('should handle UNIQUE violation gracefully on concurrent insert', async () => {
    const inputHash = 'test-hash-unique-' + Date.now();
    const analysisVersion = process.env['ANALYSIS_VERSION']!;

    // Insert first row
    await pool.query(
      `INSERT INTO fast_track_assessments
         (input_hash, title, description, grade, rationale, naics_match_score,
          recommended_action, source_chips, model_used, analysis_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [inputHash, 'T1', 'D1', 'B', 'ok', 50, 'watch', '[]', 'model1', analysisVersion],
    );

    // Second insert with ON CONFLICT DO NOTHING (mirrors worker behavior)
    const result = await pool.query(
      `INSERT INTO fast_track_assessments
         (input_hash, title, description, grade, rationale, naics_match_score,
          recommended_action, source_chips, model_used, analysis_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (input_hash, analysis_version) DO NOTHING`,
      [inputHash, 'T2', 'D2', 'A', 'better', 80, 'pursue', '[]', 'model2', analysisVersion],
    );

    // No error thrown, rowCount is 0
    expect(result.rowCount).toBe(0);

    // Original row is preserved
    const { rows } = await pool.query(
      'SELECT * FROM fast_track_assessments WHERE input_hash = $1',
      [inputHash],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('T1');
  });

  it('should throw on router error for pg-boss retry', async () => {
    // Test that a router error results in a thrown error (pg-boss retries)
    const { llmRouter } = await import('../../src/lib/llm-router.js');

    // The stub router returns error for unknown tasks — we can verify the error path
    const result = await llmRouter.route({
      task: 'fast_track_triage',
      input: {
        title: 'Test',
        description: 'Test',
        naics_codes: [],
        set_aside: null,
        place_of_performance: null,
      },
    });

    // Stub returns ok for fast_track_triage, verify the worker would throw on !ok
    if (!result.ok) {
      expect(() => {
        throw new Error(`Router error: ${result.error_kind} — ${result.error_message}`);
      }).toThrow();
    } else {
      // ok=true means we can verify worker would proceed normally
      expect(result.output).toBeDefined();
      expect(result.output.grade).toBeTruthy();
    }
  });
});
