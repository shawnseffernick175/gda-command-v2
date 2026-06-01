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

/**
 * Reads the migration SQL and splits it into UP and DOWN sections
 * using the `-- Down Migration` marker.
 */
function loadMigration() {
  const raw = readFileSync(
    resolve(__dirname, '../../migrations/v3_026_unified_opportunities.sql'),
    'utf-8',
  );
  const parts = raw.split('-- Down Migration');
  return { up: parts[0]!, down: parts[1]! };
}

describe('v3_026_unified_opportunities migration', () => {
  const migration = loadMigration();

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL, max: 2 });

    // Clean slate — drop everything this migration creates
    await pool.query(`
      DROP TABLE IF EXISTS opportunity_signals CASCADE;
      DROP TABLE IF EXISTS opportunity_field_overrides CASCADE;
      DROP TABLE IF EXISTS opportunity_links CASCADE;
      DROP TABLE IF EXISTS opportunities CASCADE;
      DROP TYPE IF EXISTS opportunity_link_confidence;
      DROP TYPE IF EXISTS opportunity_lifecycle_stage;
    `);

    // Apply the UP migration
    await pool.query(migration.up);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('UP migration', () => {
    it('should create opportunities table', async () => {
      const { rows } = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'opportunities'
      `);
      expect(rows).toHaveLength(1);
    });

    it('should create opportunity_links table', async () => {
      const { rows } = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'opportunity_links'
      `);
      expect(rows).toHaveLength(1);
    });

    it('should create opportunity_field_overrides table', async () => {
      const { rows } = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'opportunity_field_overrides'
      `);
      expect(rows).toHaveLength(1);
    });

    it('should create opportunity_signals table', async () => {
      const { rows } = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'opportunity_signals'
      `);
      expect(rows).toHaveLength(1);
    });

    it('should have all expected columns on opportunities', async () => {
      const { rows } = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'opportunities'
        ORDER BY ordinal_position
      `);
      const cols = rows.map((r) => (r as { column_name: string }).column_name);
      expect(cols).toContain('internal_id');
      expect(cols).toContain('lifecycle_stage');
      expect(cols).toContain('primary_source');
      expect(cols).toContain('title');
      expect(cols).toContain('agency');
      expect(cols).toContain('office');
      expect(cols).toContain('naics');
      expect(cols).toContain('psc');
      expect(cols).toContain('set_aside');
      expect(cols).toContain('estimated_value_cents');
      expect(cols).toContain('posted_at');
      expect(cols).toContain('response_due_at');
      expect(cols).toContain('award_at');
      expect(cols).toContain('pwin');
      expect(cols).toContain('doctrine_status');
      expect(cols).toContain('created_at');
      expect(cols).toContain('updated_at');
    });

    it('should have expected indexes on opportunities', async () => {
      const { rows } = await pool.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'opportunities'
      `);
      const names = rows.map((r) => (r as { indexname: string }).indexname);
      expect(names).toContain('idx_opportunities_stage_due');
      expect(names).toContain('idx_opportunities_agency_naics');
    });

    it('should have expected indexes on opportunity_links', async () => {
      const { rows } = await pool.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'opportunity_links'
      `);
      const names = rows.map((r) => (r as { indexname: string }).indexname);
      expect(names).toContain('idx_opportunity_links_internal_id');
      expect(names).toContain('idx_opportunity_links_review_queue');
      // UNIQUE constraint also creates an index
      expect(names.some((n) => n.includes('source'))).toBe(true);
    });

    it('should enforce lifecycle_stage enum', async () => {
      await expect(
        pool.query(`
          INSERT INTO opportunities (lifecycle_stage) VALUES ('invalid_stage')
        `),
      ).rejects.toThrow();
    });

    it('should enforce pwin CHECK constraint (0-100)', async () => {
      await expect(
        pool.query(`
          INSERT INTO opportunities (lifecycle_stage, pwin) VALUES ('signal', 101)
        `),
      ).rejects.toThrow();

      await expect(
        pool.query(`
          INSERT INTO opportunities (lifecycle_stage, pwin) VALUES ('signal', -1)
        `),
      ).rejects.toThrow();
    });

    it('should enforce doctrine_status CHECK constraint', async () => {
      await expect(
        pool.query(`
          INSERT INTO opportunities (lifecycle_stage, doctrine_status)
          VALUES ('signal', 'invalid')
        `),
      ).rejects.toThrow();
    });

    it('should enforce UNIQUE (source, source_native_id) on opportunity_links', async () => {
      // First insert an opportunity to reference
      const { rows } = await pool.query(`
        INSERT INTO opportunities (lifecycle_stage, title)
        VALUES ('solicitation', 'Test Opp')
        RETURNING internal_id
      `);
      const oppId = (rows[0] as { internal_id: string }).internal_id;

      await pool.query(`
        INSERT INTO opportunity_links (internal_id, source, source_native_id)
        VALUES ($1, 'sam', 'SAM-UNIQUE-TEST')
      `, [oppId]);

      // Duplicate should fail
      await expect(
        pool.query(`
          INSERT INTO opportunity_links (internal_id, source, source_native_id)
          VALUES ($1, 'sam', 'SAM-UNIQUE-TEST')
        `, [oppId]),
      ).rejects.toThrow();
    });

    it('should enforce UNIQUE (internal_id, field_name) on opportunity_field_overrides', async () => {
      const { rows } = await pool.query(`
        INSERT INTO opportunities (lifecycle_stage, title)
        VALUES ('forecast', 'Override Test')
        RETURNING internal_id
      `);
      const oppId = (rows[0] as { internal_id: string }).internal_id;

      await pool.query(`
        INSERT INTO opportunity_field_overrides (internal_id, field_name, field_value_json, set_by)
        VALUES ($1, 'title', '"Custom Title"', 'user-1')
      `, [oppId]);

      // Duplicate field_name for same opportunity should fail on insert (upsert must use ON CONFLICT)
      await expect(
        pool.query(`
          INSERT INTO opportunity_field_overrides (internal_id, field_name, field_value_json, set_by)
          VALUES ($1, 'title', '"Another Title"', 'user-2')
        `, [oppId]),
      ).rejects.toThrow();
    });

    it('should cascade deletes from opportunities to child tables', async () => {
      const { rows } = await pool.query(`
        INSERT INTO opportunities (lifecycle_stage, title)
        VALUES ('signal', 'Cascade Test')
        RETURNING internal_id
      `);
      const oppId = (rows[0] as { internal_id: string }).internal_id;

      await pool.query(`
        INSERT INTO opportunity_links (internal_id, source, source_native_id)
        VALUES ($1, 'govtribe', 'GT-CASCADE')
      `, [oppId]);
      await pool.query(`
        INSERT INTO opportunity_signals (internal_id, signal_type, signal_score)
        VALUES ($1, 'nsf_award', 75)
      `, [oppId]);

      // Delete parent
      await pool.query(`DELETE FROM opportunities WHERE internal_id = $1`, [oppId]);

      // Children should be gone
      const links = await pool.query(
        `SELECT * FROM opportunity_links WHERE internal_id = $1`, [oppId],
      );
      expect(links.rows).toHaveLength(0);

      const signals = await pool.query(
        `SELECT * FROM opportunity_signals WHERE internal_id = $1`, [oppId],
      );
      expect(signals.rows).toHaveLength(0);
    });

    it('should accept valid inserts with all fields', async () => {
      const { rowCount } = await pool.query(`
        INSERT INTO opportunities (
          lifecycle_stage, primary_source, title, agency, office,
          naics, psc, set_aside, estimated_value_cents,
          posted_at, response_due_at, award_at, pwin, doctrine_status
        ) VALUES (
          'solicitation', 'sam', 'Full Insert Test', 'Army', 'PEO C3T',
          '541611', 'R425', 'SBA', 5000000,
          '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z', NULL, 65, 'qualified'
        )
      `);
      expect(rowCount).toBe(1);
    });

    it('should enforce signal_score CHECK constraint (0-100)', async () => {
      const { rows } = await pool.query(`
        INSERT INTO opportunities (lifecycle_stage) VALUES ('signal') RETURNING internal_id
      `);
      const oppId = (rows[0] as { internal_id: string }).internal_id;

      await expect(
        pool.query(`
          INSERT INTO opportunity_signals (internal_id, signal_type, signal_score)
          VALUES ($1, 'nsf_award', 101)
        `, [oppId]),
      ).rejects.toThrow();
    });
  });

  describe('DOWN migration', () => {
    it('should cleanly drop all tables and types', async () => {
      // Run down migration
      await pool.query(migration.down);

      // Verify tables are gone
      const { rows } = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('opportunities', 'opportunity_links', 'opportunity_field_overrides', 'opportunity_signals')
      `);
      expect(rows).toHaveLength(0);

      // Verify enum types are gone
      const { rows: types } = await pool.query(`
        SELECT typname FROM pg_type
        WHERE typname IN ('opportunity_lifecycle_stage', 'opportunity_link_confidence')
      `);
      expect(types).toHaveLength(0);
    });

    it('should be re-runnable (UP again after DOWN)', async () => {
      // Apply up again
      await pool.query(migration.up);

      const { rows } = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'opportunities'
      `);
      expect(rows).toHaveLength(1);

      // Clean up for other tests
      await pool.query(migration.down);
    });
  });
});
