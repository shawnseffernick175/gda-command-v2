/**
 * Migration test for v3_072: vault buckets v2 (17 unified buckets).
 *
 * Validates the migration SQL logic by running UPDATE statements on
 * seeded test data. Uses the real vault_documents table (via the
 * migration runner in globalSetup) and verifies:
 * - invoice → financial
 * - teaming_agreement → subcontract_teaming
 * - all 12 regulatory subtypes → policy_regulatory
 * - filename regex: '2026_Q1_P&L.pdf' → financial
 * - filename regex: 'random.pdf' stays 'other'
 * - new constraint rejects old values
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
  return readFileSync(resolve(__dirname, '../../migrations/v3_072_vault_buckets_v2.sql'), 'utf-8');
}

describe('v3_072 vault buckets v2 migration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL, max: 3 });

    // Drop existing constraint if present (idempotent)
    await pool.query(`
      ALTER TABLE vault_documents
        DROP CONSTRAINT IF EXISTS vault_documents_doc_type_check
    `);

    // Ensure old constraint allows our seed values
    await pool.query(`
      ALTER TABLE vault_documents
        ADD CONSTRAINT vault_documents_doc_type_check
        CHECK (doc_type = ANY (ARRAY[
          'contract', 'proposal', 'invoice', 'certificate',
          'teaming_agreement', 'rfp', 'past_performance', 'color_review',
          'bid_protest', 'market_research', 'other',
          'far', 'dfars', 'dfars_pgi', 'ndaa', 'executive_order', 'gao_decision',
          'dod_policy', 'cmmc', 'cui_policy', 'itar_ear', 'usd_policy', 'other_regulatory'
        ]))
    `);

    // Clear existing test data
    await pool.query(`DELETE FROM vault_audit_trail WHERE actor LIKE 'system:v3_072%'`);
    await pool.query(`DELETE FROM vault_documents WHERE uploaded_by = 'test:v3_072'`);

    // Seed test rows
    await pool.query(`
      INSERT INTO vault_documents (filename, doc_type, doc_category, uploaded_by) VALUES
        ('contract_2026.pdf', 'invoice', 'work_product', 'test:v3_072'),
        ('teaming_nda.pdf', 'teaming_agreement', 'work_product', 'test:v3_072'),
        ('far_52_212.pdf', 'far', 'regulatory', 'test:v3_072'),
        ('dfars_update.pdf', 'dfars', 'regulatory', 'test:v3_072'),
        ('ndaa_2026.pdf', 'ndaa', 'regulatory', 'test:v3_072'),
        ('eo_14028.pdf', 'executive_order', 'regulatory', 'test:v3_072'),
        ('gao_b123.pdf', 'gao_decision', 'regulatory', 'test:v3_072'),
        ('dod_memo.pdf', 'dod_policy', 'regulatory', 'test:v3_072'),
        ('cmmc_guide.pdf', 'cmmc', 'regulatory', 'test:v3_072'),
        ('cui_policy.pdf', 'cui_policy', 'regulatory', 'test:v3_072'),
        ('itar_export.pdf', 'itar_ear', 'regulatory', 'test:v3_072'),
        ('usd_directive.pdf', 'usd_policy', 'regulatory', 'test:v3_072'),
        ('other_reg.pdf', 'other_regulatory', 'regulatory', 'test:v3_072'),
        ('dfars_pgi_update.pdf', 'dfars_pgi', 'regulatory', 'test:v3_072'),
        ('2026_Q1_P&L.pdf', 'other', 'work_product', 'test:v3_072'),
        ('random.pdf', 'other', 'work_product', 'test:v3_072'),
        ('capability_statement_envision.pdf', 'other', 'work_product', 'test:v3_072'),
        ('resume_john_smith.pdf', 'other', 'work_product', 'test:v3_072'),
        ('architecture_design.pdf', 'other', 'work_product', 'test:v3_072'),
        ('standard_contract.pdf', 'contract', 'work_product', 'test:v3_072')
    `);

    // Apply the migration
    await pool.query(loadMigration());
  });

  afterAll(async () => {
    if (pool) {
      // Clean up test data
      await pool.query(`DELETE FROM vault_audit_trail WHERE actor LIKE 'system:v3_072%'`);
      await pool.query(`DELETE FROM vault_documents WHERE uploaded_by = 'test:v3_072'`);
      await pool.end();
    }
  });

  it('migrates invoice → financial', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'contract_2026.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('financial');
  });

  it('migrates teaming_agreement → subcontract_teaming', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'teaming_nda.pdf' AND uploaded_by = 'test:v3_072'`,
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
        `SELECT doc_type FROM vault_documents WHERE filename = $1 AND uploaded_by = 'test:v3_072'`,
        [f],
      );
      expect(res.rows[0]?.doc_type).toBe('policy_regulatory');
    }
  });

  it('promotes "2026_Q1_P&L.pdf" from other → financial (filename regex)', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = '2026_Q1_P&L.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('financial');
  });

  it('keeps "random.pdf" in other (no filename signal)', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'random.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('other');
  });

  it('promotes "capability_statement_envision.pdf" to capability_statement', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'capability_statement_envision.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('capability_statement');
  });

  it('promotes "resume_john_smith.pdf" to personnel', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'resume_john_smith.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('personnel');
  });

  it('promotes "architecture_design.pdf" to technical_artifact', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'architecture_design.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('technical_artifact');
  });

  it('keeps standard_contract.pdf as contract (no change)', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'standard_contract.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('contract');
  });

  it('new constraint rejects invalid old doc_type values', async () => {
    await expect(
      pool.query(`INSERT INTO vault_documents (filename, doc_type, uploaded_by) VALUES ('bad.pdf', 'invoice', 'test:v3_072_reject')`),
    ).rejects.toThrow();
  });
});
