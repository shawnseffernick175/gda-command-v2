import { describe, it, expect } from 'vitest';
import { parseFederalOrg, titleCaseFederal } from '../../src/lib/orgHierarchy.js';

describe('titleCaseFederal', () => {
  it('converts ALL-CAPS to title case', () => {
    expect(titleCaseFederal('DEPT OF THE NAVY')).toBe('Department of the Navy');
  });

  it('preserves known acronyms', () => {
    expect(titleCaseFederal('NAVSUP WEAPON SYSTEMS SUPPORT')).toBe('NAVSUP Weapon Systems Support');
  });

  it('handles US -> U.S.', () => {
    expect(titleCaseFederal('US COAST GUARD')).toBe('U.S. Coast Guard');
  });
});

describe('parseFederalOrg', () => {
  it('parses Navy/NAVSUP chain', () => {
    const result = parseFederalOrg({
      agency: 'DEPT OF DEFENSE',
      sub_agency: 'DEPT OF THE NAVY / NAVSUP / NAVSUP WEAPON SYSTEMS SUPPORT / NAVSUP WSS MECHANICSBURG',
      department: '097',
    });

    expect(result.department_name).toBe('Department of Defense');
    expect(result.agency_name).toBe('Department of the Navy');
    expect(result.office).toBe('NAVSUP Weapon Systems Support');
    expect(result.contracting_office).toBe('NAVSUP WSS Mechanicsburg');
    expect(result.org_path).toContain('Department of Defense');
    expect(result.org_path).toContain('Department of the Navy');
  });

  it('parses Coast Guard chain', () => {
    const result = parseFederalOrg({
      agency: 'HOMELAND SECURITY, DEPARTMENT OF',
      sub_agency: 'US COAST GUARD',
      department: '070',
    });

    expect(result.department_name).toBe('Department of Homeland Security');
    expect(result.agency_name).toBe('U.S. Coast Guard');
    expect(result.contracting_office).toBe('U.S. Coast Guard');
    expect(result.office).toBeNull();
  });

  it('parses State/Embassy Kuwait chain', () => {
    const result = parseFederalOrg({
      agency: 'STATE, DEPARTMENT OF',
      sub_agency: 'BUREAU OF ADMINISTRATION / OFFICE OF LOGISTICS MANAGEMENT / EMBASSY KUWAIT',
      department: '019',
    });

    expect(result.department_name).toBe('Department of State');
    expect(result.agency_name).toBe('Bureau of Administration');
    expect(result.office).toBe('Office of Logistics Management');
    expect(result.contracting_office).toBe('Embassy Kuwait');
  });

  it('parses Army/AMC/ACC chain', () => {
    const result = parseFederalOrg({
      agency: 'DEPT OF DEFENSE',
      sub_agency: 'DEPT OF THE ARMY / AMC / ACC / MICC / MICC - FORT BRAGG',
      department: '097',
    });

    expect(result.department_name).toBe('Department of Defense');
    expect(result.agency_name).toBe('Department of the Army');
    expect(result.office).toBe('MICC');
    expect(result.contracting_office).toBe('MICC - Fort Bragg');
  });

  it('parses simple two-level hierarchy', () => {
    const result = parseFederalOrg({
      agency: 'DEPT OF DEFENSE',
      sub_agency: 'DEFENSE LOGISTICS AGENCY',
      department: '097',
    });

    expect(result.department_name).toBe('Department of Defense');
    expect(result.agency_name).toBe('Defense Logistics Agency');
    expect(result.contracting_office).toBe('Defense Logistics Agency');
    expect(result.office).toBeNull();
  });

  it('returns all nulls for empty input', () => {
    const result = parseFederalOrg({});
    expect(result.department_name).toBeNull();
    expect(result.agency_name).toBeNull();
    expect(result.office).toBeNull();
    expect(result.contracting_office).toBeNull();
    expect(result.org_path).toBeNull();
  });

  it('returns all nulls for null input', () => {
    const result = parseFederalOrg({ agency: null, sub_agency: null, department: null });
    expect(result.department_name).toBeNull();
    expect(result.agency_name).toBeNull();
    expect(result.org_path).toBeNull();
  });

  it('handles single-segment input (agency only)', () => {
    const result = parseFederalOrg({ agency: 'DEPT OF DEFENSE' });
    expect(result.department_name).toBe('Department of Defense');
    expect(result.agency_name).toBeNull();
    expect(result.office).toBeNull();
    expect(result.contracting_office).toBeNull();
    expect(result.org_path).toBe('Department of Defense');
  });

  it('strips trailing parenthetical codes', () => {
    const result = parseFederalOrg({
      agency: 'DEPT OF DEFENSE',
      sub_agency: 'DEPT OF THE NAVY (00027) / NAVSUP (W6QK)',
      department: '097',
    });

    expect(result.agency_name).toBe('Department of the Navy');
    expect(result.contracting_office).toBe('NAVSUP');
    expect(result.org_path).not.toContain('00027');
    expect(result.org_path).not.toContain('W6QK');
  });

  it('handles independent agency fallback', () => {
    const result = parseFederalOrg({
      agency: 'NATIONAL AERONAUTICS AND SPACE ADMINISTRATION',
      sub_agency: 'GODDARD SPACE FLIGHT CENTER',
      department: '080',
    });

    // mapAgencyToDepartment returns "Independent Agency" for NASA
    // so we fall back to title-cased segment[0]
    expect(result.department_name).toBe('National Aeronautics and Space Administration');
    expect(result.agency_name).toBe('Goddard Space Flight Center');
  });
});
