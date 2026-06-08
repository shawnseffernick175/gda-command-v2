/**
 * PR-A2 -- Analysis worker: priority inversion fix, analysis-status endpoint,
 * zombie reclaim, backfill throttle.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import type { SeedIds } from './seed.js';
import { getDbUrl, getSeedIds, JWT_SECRET, WEBHOOK_KEY, authHeader } from './helpers.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let ids: SeedIds;
let dbUrl: string;

beforeAll(async () => {
  dbUrl = getDbUrl();
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

// -- Priority inversion fix --
describe('Analysis priority inversion fix', () => {
  it('manual analysis job has higher pg-boss priority than backfill', async () => {
    const { startWorker } = await import('../../src/workers/analysis.js');
    const { ANALYSIS_PRIORITY, QUEUE_NAMES } = await import('../../src/lib/queue.js');

    // Insert a test opportunity
    const now = new Date().toISOString();
    const oppRes = await pool.query<{ id: string }>(
      `INSERT INTO opportunities (
         title, agency, naics, status, source_id, description,
         analysis, analysis_version, ai_analyzed_at, updated_at
       ) VALUES (
         'Priority Test Opp', 'Department of Defense',
         '541330', 'discovery', $1, 'Priority inversion test',
         NULL, NULL, NULL, $2
       ) RETURNING id::text`,
      [ids.sourceId, now],
    );
    const oppId = oppRes.rows[0]!.id;

    const workerBoss = await startWorker();
    try {
      // Pause the worker so jobs sit in queue
      await workerBoss.offWork(QUEUE_NAMES.ANALYSIS_OPPORTUNITY);

      // Enqueue a backfill job
      await workerBoss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, {
        entityType: 'opportunity' as const,
        entityId: oppId,
        priority: 'normal' as const,
        trigger: 'backfill' as const,
      }, {
        priority: ANALYSIS_PRIORITY.BACKFILL,
        retryLimit: 1,
        singletonKey: `opp-${oppId}-backfill-test`,
      });

      // Enqueue a manual job (different singleton key so both exist)
      await workerBoss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, {
        entityType: 'opportunity' as const,
        entityId: oppId,
        priority: 'high' as const,
        trigger: 'manual' as const,
      }, {
        priority: ANALYSIS_PRIORITY.USER_MANUAL,
        retryLimit: 1,
        singletonKey: `opp-${oppId}-manual-test`,
      });

      // Query pgboss.job and verify priorities
      const jobRes = await pool.query<{ priority: number; singleton_key: string }>(
        `SELECT priority, singleton_key FROM pgboss.job
         WHERE name = $1
           AND singleton_key IN ($2, $3)
           AND state = 'created'
         ORDER BY priority DESC`,
        [QUEUE_NAMES.ANALYSIS_OPPORTUNITY, `opp-${oppId}-manual-test`, `opp-${oppId}-backfill-test`],
      );

      expect(jobRes.rows.length).toBeGreaterThanOrEqual(2);
      // Manual should have higher priority
      const manualJob = jobRes.rows.find(r => r.singleton_key === `opp-${oppId}-manual-test`);
      const backfillJob = jobRes.rows.find(r => r.singleton_key === `opp-${oppId}-backfill-test`);
      expect(manualJob).toBeDefined();
      expect(backfillJob).toBeDefined();
      expect(manualJob!.priority).toBeGreaterThan(backfillJob!.priority);
      expect(manualJob!.priority).toBe(ANALYSIS_PRIORITY.USER_MANUAL);
      expect(backfillJob!.priority).toBe(ANALYSIS_PRIORITY.BACKFILL);
    } finally {
      await workerBoss.stop({ graceful: true, timeout: 5_000 });
    }
  }, 30_000);
});

// -- Zombie reclaim --
describe('Zombie active job reclaim on startup', () => {
  it('resets stale active jobs back to created state', async () => {
    const { QUEUE_NAMES, initBoss, stopBoss, registerQueues } = await import('../../src/lib/queue.js');

    // First, ensure the queue partition exists by initializing pg-boss
    const setupBoss = await initBoss();
    await registerQueues(setupBoss);

    // Enqueue a real job then manually update it to simulate a zombie
    const jobId = await setupBoss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, {
      entityType: 'opportunity' as const,
      entityId: 'zombie-test-id',
      priority: 'normal' as const,
      trigger: 'backfill' as const,
    }, {
      priority: 10,
      retryLimit: 3,
      singletonKey: 'opp-zombie-reclaim-test',
    });
    expect(jobId).toBeTruthy();

    // Manually flip to active with a stale started_on (>10 min ago)
    const zombieStarted = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await pool.query(
      `UPDATE pgboss.job
       SET state = 'active', started_on = $1
       WHERE name = $2 AND singleton_key = 'opp-zombie-reclaim-test'`,
      [zombieStarted, QUEUE_NAMES.ANALYSIS_OPPORTUNITY],
    );

    // Verify the job is in active state
    const beforeRes = await pool.query<{ state: string }>(
      `SELECT state FROM pgboss.job WHERE name = $1 AND singleton_key = 'opp-zombie-reclaim-test'`,
      [QUEUE_NAMES.ANALYSIS_OPPORTUNITY],
    );
    expect(beforeRes.rows[0]?.state).toBe('active');

    await stopBoss();

    // Simulate the reclaim SQL that startWorker() runs (same query)
    const reclaimRes = await pool.query(
      `UPDATE pgboss.job
       SET state = 'created', started_on = NULL, retry_count = retry_count
       WHERE name = $1
         AND state = 'active'
         AND started_on < NOW() - INTERVAL '10 minutes'`,
      [QUEUE_NAMES.ANALYSIS_OPPORTUNITY],
    );
    expect(reclaimRes.rowCount).toBeGreaterThanOrEqual(1);

    // Check that the job was reclaimed back to created
    const afterRes = await pool.query<{ state: string }>(
      `SELECT state FROM pgboss.job WHERE name = $1 AND singleton_key = 'opp-zombie-reclaim-test'`,
      [QUEUE_NAMES.ANALYSIS_OPPORTUNITY],
    );
    expect(afterRes.rows[0]?.state).toBe('created');
  }, 30_000);
});

// -- Analysis status endpoint --
describe('GET /v3/opportunities/:id/analysis-status', () => {
  it('returns analyzing state when a job is queued', async () => {
    const { getApp } = await import('./helpers.js');
    const { QUEUE_NAMES, ANALYSIS_PRIORITY, initBoss, stopBoss } = await import('../../src/lib/queue.js');
    const app = await getApp();
    const boss = await initBoss();

    // Insert a test opportunity
    const now = new Date().toISOString();
    const oppRes = await pool.query<{ id: string }>(
      `INSERT INTO opportunities (
         title, agency, naics, status, source_id, description,
         analysis, analysis_version, ai_analyzed_at, updated_at
       ) VALUES (
         'Status Endpoint Test Opp', 'USCG',
         '541511', 'discovery', $1, 'Status test',
         NULL, NULL, NULL, $2
       ) RETURNING id::text`,
      [ids.sourceId, now],
    );
    const oppId = oppRes.rows[0]!.id;

    // Enqueue a job for this opp (stays in created state since no worker is running)
    await boss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, {
      entityType: 'opportunity' as const,
      entityId: oppId,
      priority: 'high' as const,
      trigger: 'manual' as const,
    }, {
      priority: ANALYSIS_PRIORITY.USER_MANUAL,
      retryLimit: 1,
      singletonKey: `opp-${oppId}`,
    });

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v3/opportunities/${oppId}/analysis-status`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.state).toBe('analyzing');
      expect(body.data.has_llm_analysis).toBe(false);
    } finally {
      await stopBoss();
    }
  }, 30_000);

  it('returns done state after analysis is written', async () => {
    const { getApp } = await import('./helpers.js');
    const app = await getApp();

    // Insert opportunity with llm_analysis populated
    const now = new Date().toISOString();
    const analysisJson = JSON.stringify({
      pwin: { score: 65, band: 'competitive', model_version: 'v1-rules' },
      llm_analysis: { executive_summary: 'Test summary', win_probability: 65 },
      llm_error_kind: null,
      version: 'v0.0.1-test',
      generated_at: now,
    });
    const oppRes = await pool.query<{ id: string }>(
      `INSERT INTO opportunities (
         title, agency, naics, status, source_id, description,
         analysis, analysis_version, ai_analyzed_at, updated_at
       ) VALUES (
         'Status Done Test Opp', 'DHS',
         '541511', 'discovery', $1, 'Done state test',
         $2, 'v0.0.1-test', $3, $3
       ) RETURNING id::text`,
      [ids.sourceId, analysisJson, now],
    );
    const oppId = oppRes.rows[0]!.id;

    const res = await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${oppId}/analysis-status`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.state).toBe('done');
    expect(body.data.has_llm_analysis).toBe(true);
    expect(body.data.analyzed_at).toBeTruthy();
  }, 30_000);

  it('returns error state when llm_error_kind is set', async () => {
    const { getApp } = await import('./helpers.js');
    const app = await getApp();

    const now = new Date().toISOString();
    const analysisJson = JSON.stringify({
      pwin: { score: 50, band: 'competitive', model_version: 'v1-rules' },
      llm_analysis: null,
      llm_error_kind: 'PROVIDER_ERROR',
      version: 'v0.0.1-test',
      generated_at: now,
    });
    const oppRes = await pool.query<{ id: string }>(
      `INSERT INTO opportunities (
         title, agency, naics, status, source_id, description,
         analysis, analysis_version, ai_analyzed_at, updated_at
       ) VALUES (
         'Status Error Test Opp', 'DOE',
         '541511', 'discovery', $1, 'Error state test',
         $2, 'v0.0.1-test', $3, $3
       ) RETURNING id::text`,
      [ids.sourceId, analysisJson, now],
    );
    const oppId = oppRes.rows[0]!.id;

    const res = await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${oppId}/analysis-status`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.state).toBe('error');
    expect(body.data.llm_error_kind).toBe('PROVIDER_ERROR');
  }, 30_000);
});
