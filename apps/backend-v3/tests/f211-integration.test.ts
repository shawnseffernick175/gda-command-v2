import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';

process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';

const DB_URL = process.env['DATABASE_URL'];
const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;

function authHeader(sub = 'test-user'): Record<string, string> {
  const token = jwt.sign(
    { sub, email: 'test@gda.local', role: 'admin' },
    'test-jwt-secret',
    { algorithm: 'HS256', expiresIn: '1h' }
  );
  return { authorization: `Bearer ${token}` };
}

async function ensureTestSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id BIGSERIAL PRIMARY KEY, kind TEXT NOT NULL, url TEXT, title TEXT,
        retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), confidence TEXT NOT NULL DEFAULT 'high',
        meta JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      INSERT INTO sources (id, kind, title, retrieved_at)
      VALUES (1, 'internal', 'Test source', NOW()) ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator', is_active BOOLEAN NOT NULL DEFAULT TRUE,
        password_hash TEXT, last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, agency TEXT, sub_agency TEXT,
        department TEXT, solicitation_number TEXT, sam_notice_id TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'discovery', grade TEXT, grade_evidence TEXT,
        value_min NUMERIC, value_max NUMERIC, naics TEXT, psc TEXT, set_aside TEXT,
        place_of_performance TEXT, response_due_at TIMESTAMPTZ, posted_at TIMESTAMPTZ,
        incumbent TEXT, incumbent_confidence TEXT, incumbent_source TEXT, description TEXT,
        tags TEXT[] NOT NULL DEFAULT '{}', data_source TEXT NOT NULL DEFAULT 'manual',
        analysis JSONB, analysis_version TEXT, ai_analyzed_at TIMESTAMPTZ,
        is_teaming_required BOOLEAN NOT NULL DEFAULT FALSE,
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS pipeline_items (
        id BIGSERIAL PRIMARY KEY, opportunity_id BIGINT NOT NULL,
        capture_owner TEXT NOT NULL, win_probability NUMERIC,
        win_prob_evidence TEXT, milestone_90day TEXT, estimated_value NUMERIC,
        stage TEXT NOT NULL DEFAULT 'qualifying',
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS captures (
        id BIGSERIAL PRIMARY KEY, pipeline_item_id BIGINT NOT NULL,
        color_stage TEXT NOT NULL DEFAULT 'pink',
        capture_plan JSONB NOT NULL DEFAULT '{}', pricing_notes TEXT,
        compliance_status TEXT NOT NULL DEFAULT 'incomplete',
        win_themes TEXT[], ghost_team JSONB,
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_items (
        id BIGSERIAL PRIMARY KEY, capture_id BIGINT NOT NULL,
        requirement TEXT NOT NULL, section_ref TEXT,
        status TEXT NOT NULL DEFAULT 'open', response_notes TEXT, assigned_to TEXT,
        source_id BIGINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS action_items (
        id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, body TEXT,
        owner_email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'normal',
        due_date TIMESTAMPTZ, origin TEXT NOT NULL DEFAULT 'manual', origin_ref TEXT,
        opportunity_id BIGINT, partner_context TEXT,
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS partners (
        id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL,
        anchor_company TEXT NOT NULL, ceo TEXT, hq_location TEXT,
        founded_year INTEGER, uei TEXT, cage TEXT, duns TEXT,
        naics_codes TEXT[] NOT NULL DEFAULT '{}',
        certifications JSONB NOT NULL DEFAULT '[]',
        vehicles JSONB NOT NULL DEFAULT '[]',
        capabilities TEXT[], contact_info JSONB NOT NULL DEFAULT '{}', notes TEXT,
        source_id BIGINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS teaming_attachments (
        id BIGSERIAL PRIMARY KEY, opportunity_id BIGINT NOT NULL,
        partner_id BIGINT NOT NULL, reason TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'subcontractor',
        status TEXT NOT NULL DEFAULT 'proposed',
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS launchpad_flags (
        id BIGSERIAL PRIMARY KEY, flag_type TEXT NOT NULL,
        severity TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
        entity_type TEXT, entity_id BIGINT, doctrine_anchor TEXT,
        source_id BIGINT NOT NULL DEFAULT 1, source_url TEXT,
        dismissed_at TIMESTAMPTZ, dismissed_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT,
        action TEXT NOT NULL, table_name TEXT NOT NULL, record_id BIGINT,
        old_values JSONB, new_values JSONB, ip_address INET, user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL, max: 5 });
  await ensureTestSchema();
  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await pool.query("DELETE FROM action_items WHERE title LIKE 'F211 Test%'");
  await pool.query("DELETE FROM compliance_items WHERE requirement LIKE 'F211 Test%'");
  await pool.query("DELETE FROM captures WHERE pipeline_item_id IN (SELECT id FROM pipeline_items WHERE capture_owner = 'f211-test')");
  await pool.query("DELETE FROM pipeline_items WHERE capture_owner = 'f211-test'");
  await pool.query("DELETE FROM launchpad_flags WHERE title LIKE 'F211 Test%'");
  await pool.query("DELETE FROM opportunities WHERE title LIKE 'F211 Test%'");
  await pool.query("DELETE FROM sources WHERE title LIKE 'F211 Test%'");
  const { invalidateAllCaches } = await import('../src/services/launchpad/cache.js');
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

    const { invalidateAllCaches } = await import('../src/services/launchpad/cache.js');
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

    const { invalidateAllCaches } = await import('../src/services/launchpad/cache.js');
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

    const { invalidateAllCaches } = await import('../src/services/launchpad/cache.js');
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

    const { invalidateAllCaches } = await import('../src/services/launchpad/cache.js');
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
    const base = resolve(import.meta.dirname, '..');
    const hits = scanDir(base);
    expect(hits).toEqual([]);
  });
});
