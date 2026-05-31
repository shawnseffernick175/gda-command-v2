import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFPDSPage } from '../../src/ingest/fpds/parser.js';

const fixtureDir = join(__dirname, '..', 'fixtures', 'fpds');

function loadFixture(name: string): string {
  return readFileSync(join(fixtureDir, name), 'utf-8');
}

describe('parseFPDSPage', () => {
  it('parses a standard award entry', () => {
    const xml = loadFixture('standard_award.xml');
    const records = parseFPDSPage(xml);

    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.piid).toBe('W912DY26C0042');
    expect(r.agencyId).toBe('021');
    expect(r.agencyName).toBe('DEPT OF THE ARMY');
    expect(r.contractingOffice).toBe('US ARMY CORPS OF ENGINEERS');
    expect(r.awardeeName).toBe('ACME DEFENSE SOLUTIONS LLC');
    expect(r.awardeeUEI).toBe('XNMLXFMQD976');
    expect(r.awardeeDUNS).toBe('123456789');
    expect(r.obligatedAmount).toBe(4500000);
    expect(r.baseAndAllOptionsValue).toBe(12000000);
    expect(r.naicsCode).toBe('541330');
    expect(r.pscCode).toBe('R425');
    expect(r.setAside).toBe('Total Small Business Set-Aside');
    expect(r.signedDate).toBe('2026-05-15');
    expect(r.contractType).toBe('Firm Fixed Price');
    expect(r.parentAwardId).toBe('W912DY20D0099');
    expect(r.solicitationId).toBe('W912DY-26-R-0001');
    expect(r.placeOfPerformanceState).toBe('NC');
    expect(r.placeOfPerformanceCountry).toBe('USA');
  });

  it('parses an IDV vehicle entry', () => {
    const xml = loadFixture('idv_vehicle.xml');
    const records = parseFPDSPage(xml);

    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.piid).toBe('GS35F0222Y');
    expect(r.agencyName).toBe('GENERAL SERVICES ADMINISTRATION');
    expect(r.awardeeName).toBe('OMEGA TECH SERVICES INC');
    expect(r.awardeeUEI).toBe('ABCDE12345FG');
    expect(r.contractType).toBe('Time and Materials');
    expect(r.parentAwardId).toBeNull();
  });

  it('parses a set-aside award', () => {
    const xml = loadFixture('set_aside.xml');
    const records = parseFPDSPage(xml);

    expect(records).toHaveLength(1);
    expect(records[0].setAside).toBe('HUBZone Set-Aside');
    expect(records[0].piid).toBe('FA860126C0015');
  });

  it('handles blank UEI gracefully', () => {
    const xml = loadFixture('blank_uei.xml');
    const records = parseFPDSPage(xml);

    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.awardeeUEI).toBeNull();
    expect(r.awardeeDUNS).toBe('555444333');
    expect(r.awardeeName).toBe('LEGACY SHIPBUILDING CORP');
  });

  it('parses a modification entry (same PIID, different dates)', () => {
    const xml = loadFixture('modification.xml');
    const records = parseFPDSPage(xml);

    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.piid).toBe('W912DY26C0042');
    expect(r.obligatedAmount).toBe(6500000);
    expect(r.signedDate).toBe('2026-05-29');
  });

  it('returns empty array for empty feed', () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>`;
    const records = parseFPDSPage(xml);
    expect(records).toHaveLength(0);
  });

  it('skips entries without a PIID', () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><content><award><awardID><awardContractID></awardContractID></awardID></award></content></entry>
    </feed>`;
    const records = parseFPDSPage(xml);
    expect(records).toHaveLength(0);
  });
});
