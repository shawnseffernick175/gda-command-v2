// Fixture: simulates a test file that uses forbidden tokens as test input.
// The gate MUST allow this — test files verify the contract.

import { describe, it, expect } from 'vitest';
import { pool } from '../setup';

async function insertTestOpportunity() {
  const res = await pool.query(
    `INSERT INTO opportunities (title, status, source_id, analysis, analysis_version)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    ['Test Opp', 'discovery', 1, null, null],
  );
  return res.rows[0].id;
}

describe('GET /v3/opportunities/:id', () => {
  it('returns 503 when analysis is not ready', async () => {
    const id = await insertTestOpportunity();
    // analysis: null triggers the pre-warm + 10s synchronous block path
    const opp = { id, analysis: null };
    expect(opp.analysis).toBeNull();
  });
});
