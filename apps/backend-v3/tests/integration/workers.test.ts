/**
 * F-232 — Worker round-trip tests.
 *
 * Each test seeds state, invokes the worker against the testcontainer
 * Postgres, and asserts downstream effects.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import type { SeedIds } from './seed.js';
import { getDbUrl, getSeedIds, JWT_SECRET, WEBHOOK_KEY } from './helpers.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let ids: SeedIds;

beforeAll(async () => {
  const dbUrl = getDbUrl();
  ids = getSeedIds();

  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['GDA_WEBHOOK_KEY'] = WEBHOOK_KEY;
  process.env['DATABASE_URL'] = dbUrl;
  process.env['NODE_ENV'] = 'test';
  process.env['ANALYSIS_VERSION'] = 'v0.0.1-test';
  process.env['ANALYSIS_TIMEOUT_MS'] = '5000';
  process.env['ANALYSIS_POLL_INTERVAL_MS'] = '50';
  process.env['LLM_ROUTER_MODE'] = 'mock';

  pool = new Pool({ connectionString: dbUrl, max: 5 });
}, 120_000);

afterAll(async () => {
  if (pool) await pool.end();
}, 30_000);

// ─── Analysis worker ─────────────────────────────────────────────────
describe('Analysis worker', () => {
  it('populates analysis and ai_analyzed_at on an opportunity', async () => {
    // Insert opportunity with analysis IS NULL
    const now = new Date().toISOString();
    const oppRes = await pool.query<{ id: string }>(
      `INSERT INTO opportunities (
         title, agency, naics, status, source_id, description,
         analysis, analysis_version, ai_analyzed_at, updated_at
       ) VALUES (
         'Worker Test Opportunity', 'Department of Defense',
         '541330', 'discovery', $1, 'Worker integration test',
         NULL, NULL, NULL, $2
       ) RETURNING id::text`,
      [ids.sourceId, now],
    );
    const oppId = oppRes.rows[0]!.id;

    // Verify analysis is null
    const before = await pool.query<{ analysis: unknown; ai_analyzed_at: unknown }>(
      'SELECT analysis, ai_analyzed_at FROM opportunities WHERE id = $1',
      [oppId],
    );
    expect(before.rows[0]!.analysis).toBeNull();
    expect(before.rows[0]!.ai_analyzed_at).toBeNull();

    // Start the analysis worker
    const { startWorker } = await import('../../src/workers/analysis.js');
    const workerBoss = await startWorker();

    try {
      // Enqueue the opportunity for analysis
      await workerBoss.send('analysis-opportunity', {
        entityType: 'opportunity',
        entityId: oppId,
        priority: 'high',
        trigger: 'detail-endpoint',
      } satisfies import('../../src/lib/queue.js').AnalysisJobData);

      // Poll until analysis is populated (max 15s)
      const deadline = Date.now() + 15_000;
      let analysis: unknown = null;
      let analyzedAt: unknown = null;

      while (Date.now() < deadline) {
        const check = await pool.query<{ analysis: unknown; ai_analyzed_at: unknown }>(
          'SELECT analysis, ai_analyzed_at FROM opportunities WHERE id = $1',
          [oppId],
        );
        analysis = check.rows[0]!.analysis;
        analyzedAt = check.rows[0]!.ai_analyzed_at;
        if (analysis !== null) break;
        await new Promise((r) => setTimeout(r, 200));
      }

      expect(analysis).not.toBeNull();
      expect(analyzedAt).not.toBeNull();

      const parsed = typeof analysis === 'string' ? JSON.parse(analysis) : analysis;
      expect(typeof parsed.pwin).toBe('number');
      expect(parsed.version).toBe('v0.0.1-test');
    } finally {
      await workerBoss.stop({ graceful: true, timeout: 5_000 });
    }
  }, 30_000);
});

// ─── Capture worker ──────────────────────────────────────────────────
describe('Capture worker', () => {
  it('populates capture analysis after enqueue', async () => {
    const now = new Date().toISOString();

    // Ensure the seeded capture has no analysis
    await pool.query(
      `UPDATE captures SET analysis = NULL, analysis_version = NULL, ai_analyzed_at = NULL
       WHERE id = $1`,
      [ids.captureId],
    );

    const { startWorker } = await import('../../src/workers/analysis.js');
    const workerBoss = await startWorker();

    try {
      await workerBoss.send('analysis-capture', {
        entityType: 'capture',
        entityId: ids.captureId,
        priority: 'high',
        trigger: 'detail-endpoint',
      } satisfies import('../../src/lib/queue.js').AnalysisJobData);

      const deadline = Date.now() + 15_000;
      let analysis: unknown = null;

      while (Date.now() < deadline) {
        const check = await pool.query<{ analysis: unknown }>(
          'SELECT analysis FROM captures WHERE id = $1',
          [ids.captureId],
        );
        analysis = check.rows[0]!.analysis;
        if (analysis !== null) break;
        await new Promise((r) => setTimeout(r, 200));
      }

      expect(analysis).not.toBeNull();
    } finally {
      await workerBoss.stop({ graceful: true, timeout: 5_000 });
    }
  }, 30_000);
});

// ─── Fast-track worker ───────────────────────────────────────────────
describe('Fast-track worker', () => {
  it('writes a fast_track_assessments row', async () => {
    const { initBoss, stopBoss } = await import('../../src/lib/queue.js');
    const boss = await initBoss();

    try {
      const { subscribeFastTrack } = await import('../../src/workers/fast-track.js');
      await subscribeFastTrack();

      const inputHash = `test-ft-${Date.now()}`;
      await boss.send('analysis-fast-track', {
        input_hash: inputHash,
        input: {
          title: 'Fast Track Test',
          description: 'Worker integration test for fast-track triage',
          naics_codes: ['541330'],
          set_aside: null,
          place_of_performance: null,
        },
        analysis_version: 'v0.0.1-test',
        requestId: 'test-req-ft',
      });

      const deadline = Date.now() + 15_000;
      let found = false;

      while (Date.now() < deadline) {
        const check = await pool.query<{ id: string }>(
          'SELECT id FROM fast_track_assessments WHERE input_hash = $1',
          [inputHash],
        );
        if (check.rows.length > 0) {
          found = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      expect(found).toBe(true);
    } finally {
      await stopBoss();
    }
  }, 30_000);
});

// ─── Drafts worker ───────────────────────────────────────────────────
describe('Drafts worker', () => {
  it('populates draft_text and sets status=done', async () => {
    const { initBoss, stopBoss } = await import('../../src/lib/queue.js');
    const boss = await initBoss();

    // Start the analysis worker (which handles ingest-postprocess / draft jobs)
    const { startWorker } = await import('../../src/workers/analysis.js');
    const workerBoss = await startWorker();

    try {
      const { v4: uuidv4 } = await import('uuid');
      const draftId = uuidv4();
      const now = new Date().toISOString();

      // Insert a pending draft directly
      await pool.query(
        `INSERT INTO action_item_drafts (id, action_item_id, kind, status, created_at, updated_at)
         VALUES ($1, $2, 'reply', 'generating', $3, $3)`,
        [draftId, ids.actionItemId, now],
      );

      // Enqueue the draft job for processing
      await boss.send('ingest-postprocess', {
        draftId,
        actionItemId: ids.actionItemId,
        kind: 'reply',
      });

      const deadline = Date.now() + 15_000;
      let status: string | null = null;
      let draftText: string | null = null;

      while (Date.now() < deadline) {
        const check = await pool.query<{ status: string; draft_text: string | null }>(
          'SELECT status, draft_text FROM action_item_drafts WHERE id = $1',
          [draftId],
        );
        status = check.rows[0]?.status ?? null;
        draftText = check.rows[0]?.draft_text ?? null;
        if (status === 'done') break;
        await new Promise((r) => setTimeout(r, 200));
      }

      expect(status).toBe('done');
      expect(draftText).toBeTruthy();
    } finally {
      await workerBoss.stop({ graceful: true, timeout: 5_000 });
      await stopBoss();
    }
  }, 30_000);
});
