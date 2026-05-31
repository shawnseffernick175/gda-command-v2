import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseNECOSearchResults, extractFormState } from '../../src/ingest/neco/parser.js';
import { mapNECORecord } from '../../src/ingest/neco/mapper.js';

const FIXTURE_PATH = join(__dirname, '../fixtures/neco/sample_rfq.html');
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf-8');

describe('parseNECOSearchResults', () => {
  it('parses known-good HTML fixture to expected records', () => {
    const { records, degraded } = parseNECOSearchResults(fixtureHtml);

    expect(degraded).toBe(false);
    expect(records.length).toBe(4);

    expect(records[0].rfqNumber).toBe('N0042126Q0001');
    expect(records[0].title).toBe('Ship Repair — Hull Preservation Services');
    expect(records[0].issuingActivity).toBe('NAVSUP FLC Norfolk');
    expect(records[0].postedDate).toBe('05/28/2026');
    expect(records[0].closingDate).toBe('06/15/2026');
    expect(records[0].setAside).toBe('Small Business');
    expect(records[0].naics).toBe('336611');
    expect(records[0].detailUrl).toBe('/synopsis/detail.aspx?id=N0042126Q0001');
  });

  it('parses all four fixture records with correct RFQ numbers', () => {
    const { records } = parseNECOSearchResults(fixtureHtml);

    const rfqNums = records.map((r) => r.rfqNumber);
    expect(rfqNums).toEqual([
      'N0042126Q0001',
      'N0042126Q0002',
      'N0042126Q0003',
      'N0042126Q0004',
    ]);
  });

  it('marks result as degraded when HTML has no matching rows', () => {
    const { records, degraded, degradedReason } = parseNECOSearchResults(
      '<html><body><p>No results found</p></body></html>',
    );

    expect(degraded).toBe(true);
    expect(degradedReason).toContain('selector');
    expect(records.length).toBe(0);
  });

  it('handles empty table body gracefully', () => {
    const html = `
      <html><body>
      <table class="datagrid"><tr><th>Header</th></tr></table>
      </body></html>
    `;
    const { records, degraded } = parseNECOSearchResults(html);
    expect(records.length).toBe(0);
    expect(degraded).toBe(false);
  });
});

describe('extractFormState', () => {
  it('extracts ASP.NET form state from NECO page', () => {
    const state = extractFormState(fixtureHtml);

    expect(state['__VIEWSTATE']).toBe('dummyViewState123');
    expect(state['__EVENTVALIDATION']).toBe('dummyEventValidation456');
    expect(state['__VIEWSTATEGENERATOR']).toBe('ABC12345');
  });

  it('returns empty state from page without ASP.NET forms', () => {
    const state = extractFormState('<html><body>No form</body></html>');
    expect(Object.keys(state).length).toBe(0);
  });
});

describe('mapNECORecord', () => {
  it('maps parsed NECO record to opportunity row', () => {
    const { records } = parseNECOSearchResults(fixtureHtml);
    const { opportunity, citations } = mapNECORecord(records[0]);

    expect(opportunity.external_id).toBe('N0042126Q0001');
    expect(opportunity.title).toBe('Ship Repair — Hull Preservation Services');
    expect(opportunity.agency).toBe('Department of the Navy');
    expect(opportunity.sub_agency).toBe('NAVSUP FLC Norfolk');
    expect(opportunity.agency_subtype).toBe('Navy');
    expect(opportunity.data_source).toBe('neco');
    expect(opportunity.opportunity_type).toBe('Synopsis');
    expect(opportunity.naics).toBe('336611');
    expect(opportunity.set_aside).toBe('Small Business');
    expect(opportunity.status).toBe('discovery');
    expect(opportunity.response_due_at).toBe('06/15/2026');
    expect(opportunity.posted_at).toBe('05/28/2026');
  });

  it('generates R1 source citations for title, agency, dates', () => {
    const { records } = parseNECOSearchResults(fixtureHtml);
    const { citations } = mapNECORecord(records[0]);

    const fields = citations.map((c) => c.field);
    expect(fields).toContain('title');
    expect(fields).toContain('agency');
    expect(fields).toContain('response_due_at');
    expect(fields).toContain('posted_at');

    for (const c of citations) {
      expect(c.source_url).toContain('neco.navy.mil');
    }
  });

  it('builds correct source URL from detail link', () => {
    const { records } = parseNECOSearchResults(fixtureHtml);
    const { citations } = mapNECORecord(records[0]);

    expect(citations[0].source_url).toBe(
      'https://www.neco.navy.mil/synopsis/detail.aspx?id=N0042126Q0001',
    );
  });

  it('handles record with null optional fields', () => {
    const { records } = parseNECOSearchResults(fixtureHtml);
    const { opportunity } = mapNECORecord(records[1]);

    expect(opportunity.part_number).toBeNull();
    expect(opportunity.quantity).toBeNull();
    expect(opportunity.place_of_performance).toBeNull();
  });
});
