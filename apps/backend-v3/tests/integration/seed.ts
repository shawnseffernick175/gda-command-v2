/**
 * Minimal seed fixtures for integration tests.
 * Inserts: 1 source, 1 opportunity, 1 pipeline_item, 1 capture,
 *          1 action_item, 1 partner.
 *
 * Returns the inserted IDs for use in endpoint tests.
 */

import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

export interface SeedIds {
  sourceId: string;
  opportunityId: string;
  pipelineItemId: string;
  captureId: string;
  actionItemId: string;
}

export async function seed(databaseUrl: string): Promise<SeedIds> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    // Source
    const srcRes = await pool.query<{ id: string }>(
      `INSERT INTO sources (kind, title, retrieved_at, confidence)
       VALUES ('internal', 'Integration test source', NOW(), 'high')
       RETURNING id::text`,
    );
    const sourceId = srcRes.rows[0]!.id;

    // Opportunity
    const oppRes = await pool.query<{ id: string }>(
      `INSERT INTO opportunities (
         title, agency, naics, status, source_id, description,
         set_aside, value_min, value_max
       ) VALUES (
         'Test Opportunity — Integration', 'Department of the Army',
         '541330', 'discovery', $1, 'Integration test opportunity',
         'SDB', 1000000, 5000000
       ) RETURNING id::text`,
      [sourceId],
    );
    const opportunityId = oppRes.rows[0]!.id;

    // Pipeline item
    const piRes = await pool.query<{ id: string }>(
      `INSERT INTO pipeline_items (
         opportunity_id, capture_owner, source_id
       ) VALUES ($1, 'shawn@envision.test', $2)
       RETURNING id::text`,
      [opportunityId, sourceId],
    );
    const pipelineItemId = piRes.rows[0]!.id;

    // Capture (uses v3_001 columns — F-230 unified code to match this schema)
    const captureRes = await pool.query<{ id: string }>(
      `INSERT INTO captures (
         pipeline_item_id, color_stage, source_id,
         created_at, updated_at
       ) VALUES (
         $1, 'pink', $2,
         NOW(), NOW()
       ) RETURNING id::text`,
      [pipelineItemId, sourceId],
    );
    const captureId = captureRes.rows[0]!.id;

    // Action item (UUID id)
    const actionItemId = uuidv4();
    await pool.query(
      `INSERT INTO action_items (
         id, title, detail, owner, status, source, due_date, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'open', 'manual', NULL, NOW(), NOW())`,
      [
        actionItemId,
        'Test action item — Integration',
        'Review opportunity analysis for Army sustainment contract',
        'shawn@envision.test',
      ],
    );

    // Partner (static Riverstone profile already served from code, but ensure
    // a DB partner row for tests that might query the table directly)
    await pool.query(
      `INSERT INTO partners (
         name, anchor_company, source_id
       ) VALUES ('Riverstone Solutions', 'Riverstone Solutions (RSI)', $1)
       ON CONFLICT (name) DO NOTHING`,
      [sourceId],
    );

    return { sourceId, opportunityId, pipelineItemId, captureId, actionItemId };
  } finally {
    await pool.end();
  }
}
