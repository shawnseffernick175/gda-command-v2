/**
 * F-220.1: pg-boss bootstrap integration test
 *
 * Verifies that pg-boss can self-bootstrap its schema on a fresh database
 * (Strategy B). This test:
 * 1. Connects to the test database
 * 2. Drops and recreates the pgboss schema (simulating fresh state)
 * 3. Starts pg-boss via initBoss()
 * 4. Asserts the pgboss schema exists with expected tables
 * 5. Asserts all 5 queues register successfully
 */

import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';
import PgBoss from 'pg-boss';

process.env['JWT_SECRET'] ??= 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env['GDA_WEBHOOK_KEY'] ??= 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';
process.env['ANALYSIS_TIMEOUT_MS'] ??= '5000';
process.env['ANALYSIS_POLL_INTERVAL_MS'] ??= '50';

const DB_URL = process.env['DATABASE_URL']!;
const { Pool } = pg;

const EXPECTED_PGBOSS_TABLES = [
  'version',
  'queue',
  'job',
  'schedule',
  'subscription',
  'archive',
];

const EXPECTED_QUEUES = [
  'analysis-capture',
  'analysis-model-version-sweep',
  'analysis-opportunity',
  'analysis-periodic-refresh',
  'ingest-postprocess',
];

let pool: InstanceType<typeof Pool>;
let boss: PgBoss | null = null;

afterAll(async () => {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 5_000 });
    boss = null;
  }
  if (pool) {
    await pool.end();
  }
});

describe('pg-boss bootstrap (Strategy B — F-220.1)', () => {
  it('should create pgboss schema from scratch when boss.start() is called', async () => {
    pool = new Pool({ connectionString: DB_URL });

    // Drop pgboss schema to simulate a fresh database
    await pool.query('DROP SCHEMA IF EXISTS pgboss CASCADE');

    // Verify pgboss schema does NOT exist
    const beforeCheck = await pool.query(`
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgboss'
    `);
    expect(beforeCheck.rows).toHaveLength(0);

    // Start pg-boss — this should create the schema
    boss = new PgBoss({
      connectionString: DB_URL,
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      expireInHours: 1,
      archiveCompletedAfterSeconds: 3600,
      deleteAfterDays: 7,
    });

    await boss.start();

    // Verify pgboss schema now exists
    const afterCheck = await pool.query(`
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgboss'
    `);
    expect(afterCheck.rows).toHaveLength(1);

    // Verify expected tables exist in pgboss schema
    const tablesResult = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'pgboss' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tables = tablesResult.rows.map((r: { table_name: string }) => r.table_name);

    for (const expected of EXPECTED_PGBOSS_TABLES) {
      expect(tables).toContain(expected);
    }
  });

  it('should register all 5 queues via createQueue()', async () => {
    expect(boss).not.toBeNull();

    // Register queues (same as queue.ts registerQueues)
    for (const name of EXPECTED_QUEUES) {
      await boss!.createQueue(name);
    }

    // Verify queues are registered in pgboss.queue
    const queuesResult = await pool.query(`
      SELECT name FROM pgboss.queue WHERE name = ANY($1) ORDER BY name
    `, [EXPECTED_QUEUES]);

    const registeredQueues = queuesResult.rows.map((r: { name: string }) => r.name);
    expect(registeredQueues).toEqual(EXPECTED_QUEUES);
  });

  it('should have a version table with current schema version', async () => {
    const versionResult = await pool.query('SELECT version FROM pgboss.version');
    expect(versionResult.rows).toHaveLength(1);
    // pg-boss 10.x uses version >= 24
    expect(versionResult.rows[0].version).toBeGreaterThanOrEqual(24);
  });
});
