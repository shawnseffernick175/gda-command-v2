/**
 * F-234: F-211 Launchpad integration tests (migrated from tests/).
 *
 * No CREATE TABLE — tests use the real migration runner (v3_001–v3_008).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { getDbUrl, authHeader, getApp, closeApp } from './helpers.js';

const { Pool } = pg;

let app: FastifyInstance;
let pool: InstanceType<typeof Pool>;

beforeAll(async () => {
  const dbUrl = getDbUrl();
  pool = new Pool({ connectionString: dbUrl, max: 5 });
  app = await getApp();
}, 120_000);

afterAll(async () => {
  await closeApp();
  if (pool) await pool.end();
}, 30_000);

beforeEach(async () => {
  await pool.query("DELETE FROM action_items WHERE title LIKE 'F211 Test%'");
  await pool.query("DELETE FROM compliance_items WHERE requirement LIKE 'F211 Test%'");
  await pool.query("DELETE FROM captures WHERE pipeline_item_id IN (SELECT id FROM pipeline_items WHERE capture_owner = 'f211-test')");
  await pool.query("SET LOCAL gda.allow_pipeline_delete = 'true'");
  await pool.query("DELETE FROM pipeline_items WHERE capture_owner = 'f211-test'");
  await pool.query("DELETE FROM launchpad_flags WHERE title LIKE 'F211 Test%'");
  await pool.query("DELETE FROM opportunities WHERE title LIKE 'F211 Test%'");
  await pool.query("DELETE FROM sources WHERE title LIKE 'F211 Test%'");
  const { invalidateAllCaches } = await import('../../src/services/launchpad/cache.js');
  invalidateAllCaches();
});

// ============================================================================
// Integration: launchpad counts reflect writes
// ============================================================================
describe('Integration: launchpad counts reflect writes within cache invalidation window', () => {
  it('action_items_overdue increments after inserting overdue item', async () => {
    const res1 = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/summary',
      headers: authHeader(),
    });
    const before = JSON.parse(res1.body) as { data: { action_items_overdue: number } };
    const overdueBefore = before.data.action_items_overdue;

    await pool.query(
      `INSERT INTO action_items (title, owner_email, status, due_date, source_id)
       VALUES ('F211 Test Overdue', 'test@gda.local', 'open', NOW() - INTERVAL '2 days', 1)`
    );

    const { invalidateAllCaches } = await import('../../src/services/launchpad/cache.js');
    invalidateAllCaches();

    const res2 = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/summary',
      headers: authHeader(),
    });
    const after = JSON.parse(res2.body) as { data: { action_items_overdue: number } };
    expect(after.data.action_items_overdue).toBe(overdueBefore + 1);
  });

  it('pipeline_no_capture increments after inserting pipeline item without capture', async () => {
    const oppRes = await pool.query<{ id: string }>(
      `INSERT INTO opportunities (title, status, source_id)
       VALUES ('F211 Test Pipeline Opp', 'qualified', 1) RETURNING id`
    );
    const oppId = oppRes.rows[0]!.id;

    const { invalidateAllCaches } = await import('../../src/services/launchpad/cache.js');
    invalidateAllCaches();

    const res1 = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/summary',
      headers: authHeader(),
    });
    const before = JSON.parse(res1.body) as { data: { pipeline_no_capture: number } };
    const pipeBefore = before.data.pipeline_no_capture;

    await pool.query(
      `INSERT INTO pipeline_items (opportunity_id, capture_owner, source_id)
       VALUES ($1, 'f211-test', 1)`,
      [oppId]
    );

    invalidateAllCaches();

    const res2 = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/summary',
      headers: authHeader(),
    });
    const after = JSON.parse(res2.body) as { data: { pipeline_no_capture: number } };
    expect(after.data.pipeline_no_capture).toBe(pipeBefore + 1);
  });
});

// ============================================================================
// Integration: launchpad cache behavior
// ============================================================================
describe('Integration: launchpad per-user caching', () => {
  it('second request within 30s is a cache hit', async () => {
    const res1 = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/summary',
      headers: authHeader('cache-user-1'),
    });
    expect(res1.headers['x-cache-hit']).toBe('false');

    const res2 = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/summary',
      headers: authHeader('cache-user-1'),
    });
    expect(res2.headers['x-cache-hit']).toBe('true');
  });

  it('different users get separate cache entries', async () => {
    const res1 = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/summary',
      headers: authHeader('cache-user-a'),
    });
    expect(res1.headers['x-cache-hit']).toBe('false');

    const res2 = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/summary',
      headers: authHeader('cache-user-b'),
    });
    expect(res2.headers['x-cache-hit']).toBe('false');
  });
});

// ============================================================================
// Integration: source register with unreachable URL
// ============================================================================
describe('Integration: source register with unreachable URL', () => {
  it('returns 201 with warning when URL is unreachable', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/sources',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        kind: 'internal',
        title: 'F211 Test Unreachable',
        url: 'http://192.0.2.1:1/unreachable',
      }),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { data: { warning?: string; source: { kind: string } } };
    expect(body.data.source.kind).toBe('internal');
    expect(body.data.warning).toBeDefined();
    expect(typeof body.data.warning).toBe('string');
  });
});

// ============================================================================
// Integration: version endpoint git sha
// ============================================================================
describe('Integration: version endpoint returns current git sha', () => {
  it('commit field is a non-empty string', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/version' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { commit: string };
    expect(typeof body.commit).toBe('string');
    expect(body.commit.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Integration: launchpad flags with DB data
// ============================================================================
describe('Integration: launchpad flags reflect DB flags', () => {
  it('returns inserted flag in flags list', async () => {
    await pool.query(
      `INSERT INTO launchpad_flags (flag_type, severity, title, doctrine_anchor, source_id)
       VALUES ('cert_expiry', 'critical', 'F211 Test Flag: CMMI Expiring', 'Ethics Always', 1)`
    );

    const { invalidateAllCaches } = await import('../../src/services/launchpad/cache.js');
    invalidateAllCaches();

    const res = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/flags',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { flags: { title: string; severity: string }[] } };
    const testFlag = body.data.flags.find((f) => f.title.includes('F211 Test Flag'));
    expect(testFlag).toBeDefined();
    expect(testFlag!.severity).toBe('critical');
  });

  it('does not return dismissed flags', async () => {
    await pool.query(
      `INSERT INTO launchpad_flags (flag_type, severity, title, source_id, dismissed_at)
       VALUES ('cert_expiry', 'warning', 'F211 Test Dismissed Flag', 1, NOW())`
    );

    const { invalidateAllCaches } = await import('../../src/services/launchpad/cache.js');
    invalidateAllCaches();

    const res = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/flags',
      headers: authHeader(),
    });
    const body = JSON.parse(res.body) as { data: { flags: { title: string }[] } };
    const dismissed = body.data.flags.find((f) => f.title.includes('Dismissed Flag'));
    expect(dismissed).toBeUndefined();
  });
});

// ============================================================================
// Forbidden-token gate (visual check — scan output for banned tokens)
// ============================================================================
describe('Forbidden-token sanity check', () => {
  it('no forbidden tokens in source files', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');

    // Encoded to avoid self-detection
    const forbidden = [
      '\x230f1117', '\x231a1d27', '\x233b82f6', 'JetBrains' + ' Mono',
    ];

    function scanDir(dir: string): string[] {
      const hits: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (entry === 'node_modules' || entry === 'dist' || entry === 'tests') continue;
        const st = statSync(full);
        if (st.isDirectory()) {
          hits.push(...scanDir(full));
        } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
          const content = readFileSync(full, 'utf-8');
          for (const tok of forbidden) {
            if (content.includes(tok)) {
              hits.push(`${full}: forbidden token "${tok}"`);
            }
          }
        }
      }
      return hits;
    }

    const { resolve } = await import('node:path');
    const base = resolve(import.meta.dirname, '../..');
    const hits = scanDir(base);
    expect(hits).toEqual([]);
  });
});
