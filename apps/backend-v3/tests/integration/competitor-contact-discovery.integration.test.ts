/**
 * Integration test: competitor contact discovery
 *
 * Seeds awards for a fake competitor, runs discoverCompetitorContacts
 * in LLM_ROUTER_MODE=mock, and asserts rows in govtribe_contacts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { getDbUrl } from './helpers.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;

beforeAll(async () => {
  const dbUrl = getDbUrl();

  process.env['JWT_SECRET'] = 'test-jwt-secret-integration';
  process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key-integration';
  process.env['DATABASE_URL'] = dbUrl;
  process.env['NODE_ENV'] = 'test';
  process.env['ANALYSIS_VERSION'] = 'v0.0.1-test';
  process.env['ANALYSIS_TIMEOUT_MS'] = '5000';
  process.env['ANALYSIS_POLL_INTERVAL_MS'] = '50';
  process.env['LLM_ROUTER_MODE'] = 'mock';

  pool = new Pool({ connectionString: dbUrl, max: 5 });

  // Seed awards for fake competitor
  await pool.query(
    `INSERT INTO awards (awardee_name, agency_name, naics, value_obligated, award_date)
     VALUES
       ('ACME DEFENSE INTEGRATORS LLC', 'Department of Defense', '541330', 50000000, '2025-06-01'),
       ('ACME DEFENSE INTEGRATORS LLC', 'Department of Homeland Security', '541512', 25000000, '2025-03-15'),
       ('ACME DEFENSE INTEGRATORS LLC', 'Department of Defense', '541330', 30000000, '2025-01-10')`,
  );
}, 120_000);

afterAll(async () => {
  if (pool) {
    await pool.query(
      `DELETE FROM govtribe_contacts WHERE contact_category = 'competitor' AND company = 'Mock Competitor Corp'`,
    );
    await pool.query(
      `DELETE FROM awards WHERE awardee_name = 'ACME DEFENSE INTEGRATORS LLC'`,
    );
    await pool.end();
  }
}, 30_000);

describe('discoverCompetitorContacts', () => {
  it('writes competitor contacts from mock LLM output', async () => {
    const { discoverCompetitorContacts } = await import(
      '../../src/services/contacts/competitor-discovery.js'
    );

    const result = await discoverCompetitorContacts({
      competitors: ['ACME DEFENSE INTEGRATORS LLC'],
      max_contacts: 3,
    });

    expect(result.companies_processed).toBe(1);
    expect(result.contacts_written).toBeGreaterThanOrEqual(1);

    // Assert row exists in govtribe_contacts
    const { rows } = await pool.query(
      `SELECT name, company, contact_category, source_url, source_label, contact_type, is_manual, added_by
       FROM govtribe_contacts
       WHERE contact_category = 'competitor' AND company = 'Mock Competitor Corp'`,
    );

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const contact = rows[0] as {
      name: string;
      company: string;
      contact_category: string;
      source_url: string;
      source_label: string;
      contact_type: string;
      is_manual: boolean;
      added_by: string;
    };
    expect(contact.source_url).toBeTruthy();
    expect(contact.source_label).toBe('internet');
    expect(contact.contact_type).toBe('competitor_poc');
    expect(contact.is_manual).toBe(false);
    expect(contact.added_by).toBe('system');
  });

  it('is idempotent (no duplicate rows on re-run)', async () => {
    const { discoverCompetitorContacts } = await import(
      '../../src/services/contacts/competitor-discovery.js'
    );

    // Run again
    await discoverCompetitorContacts({
      competitors: ['ACME DEFENSE INTEGRATORS LLC'],
      max_contacts: 3,
    });

    // Count rows for this company
    const { rows } = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM govtribe_contacts
       WHERE contact_category = 'competitor' AND company = 'Mock Competitor Corp'`,
    );

    // The mock returns exactly one contact named 'Jane Smith' at 'Mock Competitor Corp'.
    // Idempotency means re-running should not create duplicates.
    expect(rows[0].count).toBe(1);
  });
});
