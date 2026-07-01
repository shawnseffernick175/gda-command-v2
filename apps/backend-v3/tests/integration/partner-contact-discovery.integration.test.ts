/**
 * Integration test: teaming-partner contact discovery
 *
 * Seeds awards for a fake small business, runs discoverPartnerContacts
 * in LLM_ROUTER_MODE=mock, and asserts rows in govtribe_contacts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { getDbUrl } from './helpers.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;

beforeAll(async () => {
  const dbUrl = getDbUrl();

  process.env['JWT_SECRET'] = 'test-jwt-secret-integration-at-least-32-chars-long';
  process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key-integration';
  process.env['DATABASE_URL'] = dbUrl;
  process.env['NODE_ENV'] = 'test';
  process.env['ANALYSIS_VERSION'] = 'v0.0.1-test';
  process.env['ANALYSIS_TIMEOUT_MS'] = '5000';
  process.env['ANALYSIS_POLL_INTERVAL_MS'] = '50';
  process.env['LLM_ROUTER_MODE'] = 'mock';

  pool = new Pool({ connectionString: dbUrl, max: 5 });

  // Create a source row (awards.source_id is NOT NULL FK)
  const { rows: srcRows } = await pool.query<{ id: number }>(
    `INSERT INTO sources (kind, title, retrieved_at, confidence)
     VALUES ('internal', 'partner-discovery integration test', NOW(), 'high')
     RETURNING id`,
  );
  const sourceId = srcRows[0].id;

  // Seed awards for fake small business with set-aside
  await pool.query(
    `INSERT INTO awards (piid, last_mod_date, awardee_name, agency_name, naics, set_aside, value_obligated, award_date, source_id)
     VALUES
       ('SUMMIT-PIID-001', '2025-06-01', 'SUMMIT TACTICAL LLC', 'DEPT OF THE ARMY', '541512', 'Total Small Business Set-Aside (FAR 19.5)', 5000000, '2025-06-01', $1),
       ('SUMMIT-PIID-002', '2025-03-15', 'SUMMIT TACTICAL LLC', 'DEPT OF THE ARMY', '541330', 'Total Small Business Set-Aside (FAR 19.5)', 3000000, '2025-03-15', $1)`,
    [sourceId],
  );
}, 120_000);

afterAll(async () => {
  if (pool) {
    await pool.query(
      `DELETE FROM govtribe_contacts WHERE contact_category = 'teaming_partner' AND company = 'SUMMIT TACTICAL LLC'`,
    );
    await pool.query(
      `DELETE FROM awards WHERE piid IN ('SUMMIT-PIID-001', 'SUMMIT-PIID-002')`,
    );
    await pool.end();
  }
}, 30_000);

describe('discoverPartnerContacts', () => {
  it('writes teaming-partner contacts from mock LLM output', async () => {
    const { discoverPartnerContacts } = await import(
      '../../src/services/contacts/partner-discovery.js'
    );

    const result = await discoverPartnerContacts({
      partners: ['SUMMIT TACTICAL LLC'],
      max_contacts: 3,
    });

    expect(result.companies_processed).toBe(1);
    expect(result.contacts_written).toBeGreaterThanOrEqual(1);

    // Assert row exists in govtribe_contacts
    const { rows } = await pool.query(
      `SELECT name, company, contact_category, source_url, source_label, contact_type, is_manual, added_by
       FROM govtribe_contacts
       WHERE contact_category = 'teaming_partner' AND company = 'SUMMIT TACTICAL LLC'`,
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
    expect(contact.contact_type).toBe('partner_poc');
    expect(contact.is_manual).toBe(false);
    expect(contact.added_by).toBe('system');
  });

  it('is idempotent (no duplicate rows on re-run)', async () => {
    const { discoverPartnerContacts } = await import(
      '../../src/services/contacts/partner-discovery.js'
    );

    // Run again
    await discoverPartnerContacts({
      partners: ['SUMMIT TACTICAL LLC'],
      max_contacts: 3,
    });

    // Count rows for this company
    const { rows } = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM govtribe_contacts
       WHERE contact_category = 'teaming_partner' AND company = 'SUMMIT TACTICAL LLC'`,
    );

    // The mock returns exactly one contact named 'John Doe'.
    // Idempotency means re-running should not create duplicates.
    expect(rows[0].count).toBe(1);
  });
});
