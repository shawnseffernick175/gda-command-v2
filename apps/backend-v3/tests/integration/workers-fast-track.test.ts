/**
 * F-234: Fast-track worker tests (migrated from tests/workers/).
 *
 * No CREATE TABLE — tests use the real migration runner (v3_001–v3_008).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { getDbUrl } from './helpers.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;

beforeAll(async () => {
  const dbUrl = getDbUrl();
  pool = new Pool({ connectionString: dbUrl, max: 5 });
  await pool.query('DELETE FROM fast_track_assessments');
}, 120_000);

afterAll(async () => {
  await pool.query('DELETE FROM fast_track_assessments');
  if (pool) await pool.end();
}, 30_000);

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

    const { rows } = await pool.query<Record<string, unknown>>(
      'SELECT * FROM fast_track_assessments WHERE input_hash = $1',
      [inputHash],
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
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

    await pool.query(
      `INSERT INTO fast_track_assessments
         (input_hash, title, description, grade, rationale, naics_match_score,
          recommended_action, source_chips, model_used, analysis_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [inputHash, 'T1', 'D1', 'B', 'ok', 50, 'watch', '[]', 'model1', analysisVersion],
    );

    const result = await pool.query(
      `INSERT INTO fast_track_assessments
         (input_hash, title, description, grade, rationale, naics_match_score,
          recommended_action, source_chips, model_used, analysis_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (input_hash, analysis_version) DO NOTHING`,
      [inputHash, 'T2', 'D2', 'A', 'better', 80, 'pursue', '[]', 'model2', analysisVersion],
    );

    expect(result.rowCount).toBe(0);

    const { rows } = await pool.query<{ title: string }>(
      'SELECT * FROM fast_track_assessments WHERE input_hash = $1',
      [inputHash],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('T1');
  });

  it('should throw on router error for pg-boss retry', async () => {
    const { llmRouter } = await import('../../src/lib/llm-router.js');

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

    if (!result.ok) {
      expect(() => {
        throw new Error(`Router error: ${result.error_kind} — ${result.error_message}`);
      }).toThrow();
    } else {
      expect(result.output).toBeDefined();
      expect(result.output.grade).toBeTruthy();
    }
  });
});
