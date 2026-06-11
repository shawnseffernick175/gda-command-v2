/**
 * Unit tests for the FPDS Atom Feed XML parser.
 */

import { describe, it, expect } from 'vitest';
import { parseFpdsAtomFeed } from '../../../src/integrations/fpds/parser.js';

const SAMPLE_FPDS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>FPDS Search Results</title>
  <entry>
    <title>Award W56KGZ-22-D-0001</title>
    <content>
      <award>
        <awardID>
          <awardContractID>
            <PIID>W56KGZ-22-D-0001</PIID>
          </awardContractID>
        </awardID>
        <vendor>
          <vendorHeader>
            <vendorName>ManTech International Corp</vendorName>
          </vendorHeader>
          <vendorSiteDetails>
            <uniqueEntityIdentifier>UEI123456</uniqueEntityIdentifier>
          </vendorSiteDetails>
        </vendor>
        <contractingOfficeAgencyID name="Department of Defense"/>
        <productOrServiceInformation>
          <NAICS code="541330"/>
        </productOrServiceInformation>
        <dollarValues>
          <obligatedAmount>2500000.00</obligatedAmount>
        </dollarValues>
        <relevantContractDates>
          <effectiveDate>2022-03-15</effectiveDate>
          <ultimateCompletionDate>2025-03-14</ultimateCompletionDate>
        </relevantContractDates>
        <placeOfPerformance>
          <principalPlaceOfPerformance>
            <stateCode>VA</stateCode>
          </principalPlaceOfPerformance>
        </placeOfPerformance>
        <solicitationID>W56KGZ-22-R-0001</solicitationID>
        <contractDescription>IT Support Services for Army TACOM</contractDescription>
      </award>
    </content>
  </entry>
  <entry>
    <title>Award FA8732-21-D-0042</title>
    <content>
      <award>
        <awardID>
          <awardContractID>
            <PIID>FA8732-21-D-0042</PIID>
          </awardContractID>
        </awardID>
        <vendor>
          <vendorHeader>
            <vendorName>SAIC Inc</vendorName>
          </vendorHeader>
        </vendor>
        <contractingOfficeAgencyID name="Department of the Air Force"/>
        <productOrServiceInformation>
          <NAICS code="541511"/>
        </productOrServiceInformation>
        <dollarValues>
          <obligatedAmount>8000000.00</obligatedAmount>
        </dollarValues>
        <relevantContractDates>
          <effectiveDate>2021-09-01</effectiveDate>
          <currentCompletionDate>2024-08-31</currentCompletionDate>
        </relevantContractDates>
      </award>
    </content>
  </entry>
</feed>`;

describe('parseFpdsAtomFeed', () => {
  it('parses multiple entries from valid Atom XML', () => {
    const entries = parseFpdsAtomFeed(SAMPLE_FPDS_XML);

    expect(entries).toHaveLength(2);

    // First entry
    expect(entries[0].piid).toBe('W56KGZ-22-D-0001');
    expect(entries[0].recipientName).toBe('ManTech International Corp');
    expect(entries[0].recipientUei).toBe('UEI123456');
    expect(entries[0].contractingAgency).toBe('Department of Defense');
    expect(entries[0].naicsCode).toBe('541330');
    expect(entries[0].dollarsObligated).toBe(2500000);
    expect(entries[0].periodOfPerformanceStart).toBe('2022-03-15');
    expect(entries[0].periodOfPerformanceEnd).toBe('2025-03-14');
    expect(entries[0].placeOfPerformanceState).toBe('VA');
    expect(entries[0].solicitationId).toBe('W56KGZ-22-R-0001');
    expect(entries[0].description).toBe('IT Support Services for Army TACOM');

    // Second entry
    expect(entries[1].piid).toBe('FA8732-21-D-0042');
    expect(entries[1].recipientName).toBe('SAIC Inc');
    expect(entries[1].naicsCode).toBe('541511');
    expect(entries[1].dollarsObligated).toBe(8000000);
  });

  it('returns empty array for empty input', () => {
    expect(parseFpdsAtomFeed('')).toEqual([]);
    expect(parseFpdsAtomFeed('  ')).toEqual([]);
  });

  it('returns empty array for feed with no entries', () => {
    const xml = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Empty Results</title>
    </feed>`;
    expect(parseFpdsAtomFeed(xml)).toEqual([]);
  });

  it('handles single entry (not wrapped in array)', () => {
    const xml = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <content>
          <award>
            <awardID>
              <awardContractID>
                <PIID>SINGLE-001</PIID>
              </awardContractID>
            </awardID>
            <vendor>
              <vendorHeader>
                <vendorName>Test Corp</vendorName>
              </vendorHeader>
            </vendor>
          </award>
        </content>
      </entry>
    </feed>`;

    const entries = parseFpdsAtomFeed(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].piid).toBe('SINGLE-001');
    expect(entries[0].recipientName).toBe('Test Corp');
  });

  it('handles missing optional fields gracefully', () => {
    const xml = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <content>
          <award>
            <awardID>
              <awardContractID>
                <PIID>MINIMAL-001</PIID>
              </awardContractID>
            </awardID>
          </award>
        </content>
      </entry>
    </feed>`;

    const entries = parseFpdsAtomFeed(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].piid).toBe('MINIMAL-001');
    expect(entries[0].recipientName).toBeNull();
    expect(entries[0].naicsCode).toBeNull();
    expect(entries[0].dollarsObligated).toBeNull();
  });
});
