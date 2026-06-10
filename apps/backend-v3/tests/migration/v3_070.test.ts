/**
 * Migration test for v3_070: vault buckets v2 (17 unified buckets).
 *
 * Tests:
 * 8. All 'invoice' → 'financial', all 'teaming_agreement' → 'subcontract_teaming', all regulatory subtypes → 'policy_regulatory'
 * 9. A row with filename='2026_Q1_P&L.pdf' and doc_type='other' is promoted to 'financial'
 * 10. A generic doc_type='other' row with filename='random.pdf' stays in 'other'
 */

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

function loadMigration(): string {
  return readFileSync(resolve(__dirname, '../../migrations/v3_070_vault_buckets_v2.sql'), 'utf-8');
}

describe('v3_070 vault buckets v2 migration', () => {
  const TEST_TABLE = 'vault_documents_migration_test_v070';

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL, max: 3 });

    // Create a test copy of vault_documents with old schema
    await pool.query(`
      DROP TABLE IF EXISTS vault_audit_trail_test CASCADE;
      DROP TABLE IF EXISTS ${TEST_TABLE} CASCADE;
      CREATE TABLE ${TEST_TABLE} (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL DEFAULT '',
        doc_type TEXT NOT NULL DEFAULT 'other',
        doc_category TEXT NOT NULL DEFAULT 'work_product',
        is_system_doc BOOLEAN NOT NULL DEFAULT false,
        file_size_bytes BIGINT,
        file_path TEXT,
        extracted_text TEXT,
        ai_summary TEXT,
        ai_tags TEXT[],
        ai_entities JSONB,
        regulatory_citation TEXT,
        effective_date TIMESTAMPTZ,
        applicable_naics TEXT[],
        linked_opportunity_id INTEGER,
        linked_capture_id INTEGER,
        linked_award_id INTEGER,
        uploaded_by TEXT NOT NULL DEFAULT 'admin',
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        full_text_search TSVECTOR
      );

      -- Add old constraint
      ALTER TABLE ${TEST_TABLE}
        ADD CONSTRAINT vault_documents_doc_type_check
        CHECK (doc_type = ANY (ARRAY[
          'contract', 'proposal', 'invoice', 'certificate',
          'teaming_agreement', 'rfp', 'past_performance', 'color_review',
          'bid_protest', 'market_research', 'other',
          'far', 'dfars', 'dfars_pgi', 'ndaa', 'executive_order', 'gao_decision',
          'dod_policy', 'cmmc', 'cui_policy', 'itar_ear', 'usd_policy', 'other_regulatory'
        ]));

      -- Create audit trail table
      CREATE TABLE vault_audit_trail_test (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL DEFAULT 'admin',
        detail TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Seed test rows
    await pool.query(`
      INSERT INTO ${TEST_TABLE} (filename, doc_type, doc_category) VALUES
        ('contract_2026.pdf', 'invoice', 'work_product'),
        ('teaming_nda.pdf', 'teaming_agreement', 'work_product'),
        ('far_52_212.pdf', 'far', 'regulatory'),
        ('dfars_update.pdf', 'dfars', 'regulatory'),
        ('ndaa_2026.pdf', 'ndaa', 'regulatory'),
        ('eo_14028.pdf', 'executive_order', 'regulatory'),
        ('gao_b123.pdf', 'gao_decision', 'regulatory'),
        ('dod_memo.pdf', 'dod_policy', 'regulatory'),
        ('cmmc_guide.pdf', 'cmmc', 'regulatory'),
        ('cui_policy.pdf', 'cui_policy', 'regulatory'),
        ('itar_export.pdf', 'itar_ear', 'regulatory'),
        ('usd_directive.pdf', 'usd_policy', 'regulatory'),
        ('other_reg.pdf', 'other_regulatory', 'regulatory'),
        ('dfars_pgi_update.pdf', 'dfars_pgi', 'regulatory'),
        ('2026_Q1_P&L.pdf', 'other', 'work_product'),
        ('random.pdf', 'other', 'work_product'),
        ('capability_statement_envision.pdf', 'other', 'work_product'),
        ('resume_john_smith.pdf', 'other', 'work_product'),
        ('architecture_design.pdf', 'other', 'work_product'),
        ('standard_contract.pdf', 'contract', 'work_product')
    `);

    // Now apply the migration adapted for our test table
    // Replace table name references but preserve constraint names
    const migrationSql = loadMigration()
      .replace(/ALTER TABLE vault_documents/g, `ALTER TABLE ${TEST_TABLE}`)
      .replace(/FROM vault_documents/g, `FROM ${TEST_TABLE}`)
      .replace(/UPDATE vault_documents/g, `UPDATE ${TEST_TABLE}`)
      .replace(/INSERT INTO vault_audit_trail/g, 'INSERT INTO vault_audit_trail_test');

    await pool.query(migrationSql);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP TABLE IF EXISTS vault_audit_trail_test CASCADE`);
      await pool.query(`DROP TABLE IF EXISTS ${TEST_TABLE} CASCADE`);
      await pool.end();
    }
  });

  it('migrates invoice → financial', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM ${TEST_TABLE} WHERE filename = 'contract_2026.pdf'`,
    );
    expect(res.rows[0]?.doc_type).toBe('financial');
  });

  it('migrates teaming_agreement → subcontract_teaming', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM ${TEST_TABLE} WHERE filename = 'teaming_nda.pdf'`,
    );
    expect(res.rows[0]?.doc_type).toBe('subcontract_teaming');
  });

  it('migrates all 12 regulatory subtypes → policy_regulatory', async () => {
    const regFiles = [
      'far_52_212.pdf', 'dfars_update.pdf', 'ndaa_2026.pdf',
      'eo_14028.pdf', 'gao_b123.pdf', 'dod_memo.pdf',
      'cmmc_guide.pdf', 'cui_policy.pdf', 'itar_export.pdf',
      'usd_directive.pdf', 'other_reg.pdf', 'dfars_pgi_update.pdf',
    ];
    for (const f of regFiles) {
      const res = await pool.query(
        `SELECT doc_type FROM ${TEST_TABLE} WHERE filename = $1`,
        [f],
      );
      expect(res.rows[0]?.doc_type).toBe('policy_regulatory');
    }
  });

  it('promotes "2026_Q1_P&L.pdf" from other → financial (filename regex)', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM ${TEST_TABLE} WHERE filename = '2026_Q1_P&L.pdf'`,
    );
    expect(res.rows[0]?.doc_type).toBe('financial');
  });

  it('keeps "random.pdf" in other (no filename signal)', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM ${TEST_TABLE} WHERE filename = 'random.pdf'`,
    );
    expect(res.rows[0]?.doc_type).toBe('other');
  });

  it('promotes "capability_statement_envision.pdf" to capability_statement', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM ${TEST_TABLE} WHERE filename = 'capability_statement_envision.pdf'`,
    );
    expect(res.rows[0]?.doc_type).toBe('capability_statement');
  });

  it('promotes "resume_john_smith.pdf" to personnel', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM ${TEST_TABLE} WHERE filename = 'resume_john_smith.pdf'`,
    );
    expect(res.rows[0]?.doc_type).toBe('personnel');
  });

  it('promotes "architecture_design.pdf" to technical_artifact', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM ${TEST_TABLE} WHERE filename = 'architecture_design.pdf'`,
    );
    expect(res.rows[0]?.doc_type).toBe('technical_artifact');
  });

  it('keeps standard_contract.pdf as contract (no change)', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM ${TEST_TABLE} WHERE filename = 'standard_contract.pdf'`,
    );
    expect(res.rows[0]?.doc_type).toBe('contract');
  });

  it('new constraint rejects invalid old doc_type values', async () => {
    await expect(
      pool.query(`INSERT INTO ${TEST_TABLE} (filename, doc_type) VALUES ('bad.pdf', 'invoice')`),
    ).rejects.toThrow();
  });
});
