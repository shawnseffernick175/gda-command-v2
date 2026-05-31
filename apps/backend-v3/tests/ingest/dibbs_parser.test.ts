import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDIBBSListingPage } from '../../src/ingest/dibbs/parser.js';
import { mapDIBBSRecord } from '../../src/ingest/dibbs/mapper.js';

const FIXTURE_PATH = join(__dirname, '../fixtures/dibbs/sample_pr.html');
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf-8');

describe('parseDIBBSListingPage', () => {
  it('parses known-good HTML fixture to expected records', () => {
    const { records, degraded } = parseDIBBSListingPage(fixtureHtml);

    expect(degraded).toBe(false);
    expect(records.length).toBe(6);

    expect(records[0].solicitationNumber).toBe('SPE4A726Q0001');
    expect(records[0].title).toBe('BOLT, MACHINE — Grade 8 hex head');
    expect(records[0].partNumber).toBe('MS90725-52');
    expect(records[0].quantity).toBe(5000);
    expect(records[0].returnByDate).toBe('06/15/2026');
    expect(records[0].postedDate).toBe('05/28/2026');
    expect(records[0].detailUrl).toBe('/RFQ/RfqRec_View.aspx?solNum=SPE4A726Q0001');
  });

  it('parses all six fixture records with correct solicitation numbers', () => {
    const { records } = parseDIBBSListingPage(fixtureHtml);

    const solNums = records.map((r) => r.solicitationNumber);
    expect(solNums).toEqual([
      'SPE4A726Q0001',
      'SPE4A726Q0002',
      'SPE4A726Q0003',
      'SPE4A726Q0004',
      'SPE4A726Q0005',
      'SPE4A726Q0006',
    ]);
  });

  it('marks result as degraded when HTML has no matching rows', () => {
    const { records, degraded, degradedReason } = parseDIBBSListingPage(
      '<html><body><p>No data</p></body></html>',
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
    const { records, degraded } = parseDIBBSListingPage(html);
    expect(records.length).toBe(0);
    expect(degraded).toBe(false);
  });
});

describe('mapDIBBSRecord', () => {
  it('maps parsed DIBBS record to opportunity row', () => {
    const { records } = parseDIBBSListingPage(fixtureHtml);
    const { opportunity, citations } = mapDIBBSRecord(records[0]);

    expect(opportunity.external_id).toBe('SPE4A726Q0001');
    expect(opportunity.title).toBe('BOLT, MACHINE — Grade 8 hex head');
    expect(opportunity.agency).toBe('Defense Logistics Agency');
    expect(opportunity.agency_subtype).toBe('DLA');
    expect(opportunity.data_source).toBe('dibbs');
    expect(opportunity.part_number).toBe('MS90725-52');
    expect(opportunity.quantity).toBe(5000);
    expect(opportunity.opportunity_type).toBe('RFQ');
    expect(opportunity.status).toBe('discovery');
    expect(opportunity.response_due_at).toBe('06/15/2026');
    expect(opportunity.posted_at).toBe('05/28/2026');
  });

  it('generates R1 source citations for title, agency, dates', () => {
    const { records } = parseDIBBSListingPage(fixtureHtml);
    const { citations } = mapDIBBSRecord(records[0]);

    const fields = citations.map((c) => c.field);
    expect(fields).toContain('title');
    expect(fields).toContain('agency');
    expect(fields).toContain('response_due_at');
    expect(fields).toContain('posted_at');

    for (const c of citations) {
      expect(c.source_url).toContain('dibbs.bsm.dla.mil');
    }
  });

  it('builds correct source URL from detail link', () => {
    const { records } = parseDIBBSListingPage(fixtureHtml);
    const { citations } = mapDIBBSRecord(records[0]);

    expect(citations[0].source_url).toBe(
      'https://www.dibbs.bsm.dla.mil/RFQ/RfqRec_View.aspx?solNum=SPE4A726Q0001',
    );
  });
});
