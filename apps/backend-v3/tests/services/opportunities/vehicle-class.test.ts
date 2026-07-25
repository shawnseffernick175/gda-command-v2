import { describe, it, expect } from 'vitest';
import {
  classifyOpportunityVehicle,
  vehicleClassSqlCondition,
  parseOpportunityClass,
} from '../../../src/services/opportunities/vehicle-class.js';

describe('classifyOpportunityVehicle (report item 1)', () => {
  it('classifies a BAA from the explicit phrase', () => {
    const r = classifyOpportunityVehicle({
      title: 'FY26 Broad Agency Announcement for Autonomy',
      description: null,
      is_idiq: false,
    });
    expect(r.class).toBe('baa');
    expect(r.source).toMatch(/Broad Agency Announcement/);
  });

  it('classifies an OTA from "other transaction"', () => {
    const r = classifyOpportunityVehicle({
      title: 'Prototype Other Transaction Agreement',
      description: null,
      is_idiq: false,
    });
    expect(r.class).toBe('ota');
  });

  it('classifies IDIQ from the is_idiq flag', () => {
    const r = classifyOpportunityVehicle({ title: 'Support Services', description: null, is_idiq: true });
    expect(r.class).toBe('idiq');
    expect(r.source).toMatch(/is_idiq/);
  });

  it('classifies IDIQ from explicit text when flag is absent', () => {
    const r = classifyOpportunityVehicle({
      title: 'IDIQ for Engineering Services',
      description: 'Indefinite Delivery / Indefinite Quantity',
      is_idiq: false,
    });
    expect(r.class).toBe('idiq');
  });

  it('leaves an ambiguous row as standard with no source', () => {
    const r = classifyOpportunityVehicle({
      title: 'Cybersecurity Support Services',
      description: 'Full and open competition for IT support.',
      is_idiq: false,
    });
    expect(r.class).toBe('standard');
    expect(r.source).toBeNull();
  });

  it('does not treat the bare "OTA" acronym as an OTA (false-positive guard)', () => {
    const r = classifyOpportunityVehicle({
      title: 'Minnesota Data Services',
      description: 'Regional data hosting.',
      is_idiq: false,
    });
    expect(r.class).toBe('standard');
  });

  it('gives BAA precedence over OTA/IDIQ signals', () => {
    const r = classifyOpportunityVehicle({
      title: 'Broad Agency Announcement — Other Transaction IDIQ',
      description: null,
      is_idiq: true,
    });
    expect(r.class).toBe('baa');
  });
});

describe('vehicleClassSqlCondition', () => {
  it('encodes precedence so OTA excludes BAAs and IDIQ excludes both', () => {
    expect(vehicleClassSqlCondition('baa')).not.toContain('NOT');
    expect(vehicleClassSqlCondition('ota')).toContain('NOT');
    const idiq = vehicleClassSqlCondition('idiq')!;
    expect((idiq.match(/NOT/g) ?? []).length).toBe(2);
  });
});

describe('parseOpportunityClass', () => {
  it('accepts known classes and rejects others', () => {
    expect(parseOpportunityClass('baa')).toBe('baa');
    expect(parseOpportunityClass('ota')).toBe('ota');
    expect(parseOpportunityClass('idiq')).toBe('idiq');
    expect(parseOpportunityClass('standard')).toBe('standard');
    expect(parseOpportunityClass('bogus')).toBeNull();
    expect(parseOpportunityClass(undefined)).toBeNull();
  });
});
