/**
 * Migration test for v3_072: vault buckets v2 (17 unified buckets).
 *
 * Self-contained: loads old vault_documents schema from a SQL fixture,
 * seeds rows, applies the migration, then asserts:
 * - invoice → financial
 * - teaming_agreement → subcontract_teaming
 * - all 12 regulatory subtypes → policy_regulatory
 * - filename regex reclassifications (financial, capability_statement, etc.)
 * - ambiguous files remain 'other'
 * - new constraint rejects old values
 *
 * No CREATE TABLE in this file -- old schema lives in fixtures/vault_documents_old_schema.sql.
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

function loadSql(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf-8');
}

describe('v3_072 vault buckets v2 migration', () => {
  const fixtureSql = loadSql('./fixtures/vault_documents_old_schema.sql');
  const migrationSql = loadSql('../../migrations/v3_072_vault_buckets_v2.sql');

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL, max: 3 });

    // Set up old schema + seed data from fixture
    await pool.query(fixtureSql);

    // Apply the migration
    await pool.query(migrationSql);
  });

  afterAll(async () => {
    if (pool) await pool.end();
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
      'far_52_212.pdf', 'dfars_252.pdf', 'ndaa_2026.pdf',
      'exec_order_14028.pdf', 'gao_protest.pdf', 'dod_memo.pdf',
      'cmmc_lvl2.pdf', 'cui_marking.pdf', 'itar_guide.pdf',
      'usd_memo.pdf', 'other_reg.pdf',
    ];
    for (const f of regFiles) {
      const res = await pool.query(
        `SELECT doc_type FROM vault_documents WHERE filename = $1 AND uploaded_by = 'test:v3_072'`,
        [f],
      );
      expect(res.rows[0]?.doc_type).toBe('policy_regulatory');
    }
  });

  it('promotes "invoice_q4.pdf" from other → financial (filename regex)', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'invoice_q4.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('financial');
  });

  it('keeps "random_file.pdf" in other (no filename signal)', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'random_file.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('other');
  });

  it('promotes "capability_statement_envision.pdf" to capability_statement', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'capability_statement_envision.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('capability_statement');
  });

  it('promotes "email_from_co.pdf" to correspondence', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'email_from_co.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('correspondence');
  });

  it('promotes "resume_john.pdf" to personnel', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'resume_john.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('personnel');
  });

  it('promotes "architecture_doc.pdf" to technical_artifact', async () => {
    const res = await pool.query(
      `SELECT doc_type FROM vault_documents WHERE filename = 'architecture_doc.pdf' AND uploaded_by = 'test:v3_072'`,
    );
    expect(res.rows[0]?.doc_type).toBe('technical_artifact');
  });

  it('new constraint rejects invalid old doc_type values', async () => {
    await expect(
      pool.query(`INSERT INTO vault_documents (filename, doc_type, uploaded_by) VALUES ('bad.pdf', 'invoice', 'test:v3_072_reject')`),
    ).rejects.toThrow();
  });
});
