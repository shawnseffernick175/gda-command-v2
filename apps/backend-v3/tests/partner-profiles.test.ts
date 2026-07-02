import { describe, it, expect, vi } from 'vitest';
import {
  isStale,
  isValidOu,
  isOuOwner,
  toListItem,
  toDetailView,
  computeTeamingFitScore,
  VALID_OUS,
  OU_OWNERS,
  ALLOWED_PATCH_FIELDS,
  type PartnerProfileRow,
} from '../src/lib/partner-profiles.js';

/* ── Fixtures ──────────────────────────────────────────────────────── */

const RIVERSTONE_PROFILE: PartnerProfileRow = {
  ou: 'riverstone',
  name: 'Riverstone Solutions',
  owner: '00000000-0000-0000-0000-000000000002',
  overview: 'IC-focused cyber and TechSIGINT provider.',
  agencies_of_strength: ['MDA', 'NSA', 'NRO', 'DIA'],
  naics_codes: ['541512', '541511', '541519', '541330'],
  capabilities_summary: [
    { area: 'TechSIGINT', detail: 'Signals intelligence collection', evidence_doc_id: null },
    { area: 'Cyber Operations', detail: 'Offensive and defensive cyber', evidence_doc_id: null },
    { area: 'Classified DevSecOps', detail: 'CI/CD in classified environments', evidence_doc_id: null },
  ],
  past_performance_summary: [
    { agency: 'MDA', contract_id: 'HQ085926DF469', value: null, period: '2025-present', evidence_doc_id: null },
    { agency: 'NSA', contract_id: null, value: null, period: '2022-present', evidence_doc_id: null },
  ],
  key_personnel: [
    { name: 'Angela (OU2 POC)', clearance: 'TS/SCI', certifications: ['PMP', 'CISSP'] },
  ],
  certifications: ['HUBZone', 'WOSB', 'SDB', 'CMMC Level 2'],
  active: true,
  last_reviewed_at: new Date().toISOString(),
};

const PD_SYSTEMS_PROFILE: PartnerProfileRow = {
  ou: 'pd_systems',
  name: 'PD Systems',
  owner: '00000000-0000-0000-0000-000000000001',
  overview: 'Training-focused integrator with 300+ headcount.',
  agencies_of_strength: ['TRADOC', 'PEO STRI', 'DLA', 'USSOCOM'],
  naics_codes: ['611430', '541512', '541330', '334511'],
  capabilities_summary: [
    { area: 'XR/AR/VR Training', detail: 'Immersive training systems', evidence_doc_id: null },
    { area: 'Digital Twin Platforms', detail: 'Real-time digital twin simulation', evidence_doc_id: null },
    { area: 'LVC Integration', detail: 'Live, Virtual, Constructive training', evidence_doc_id: null },
  ],
  past_performance_summary: [
    { agency: 'TRADOC', contract_id: null, value: null, period: '2021-present', evidence_doc_id: null },
    { agency: 'PEO STRI', contract_id: null, value: null, period: '2023-present', evidence_doc_id: null },
  ],
  key_personnel: [
    { name: 'Tom Rogers (OU1 Lead)', clearance: 'Secret', certifications: ['PMP'] },
  ],
  certifications: ['V3 Veteran', 'SDB', 'ISO 9001'],
  active: true,
  last_reviewed_at: new Date().toISOString(),
};

/* ── OU Validation ─────────────────────────────────────────────────── */

describe('isValidOu', () => {
  it('accepts riverstone and pd_systems', () => {
    expect(isValidOu('riverstone')).toBe(true);
    expect(isValidOu('pd_systems')).toBe(true);
  });

  it('rejects unknown OUs', () => {
    expect(isValidOu('envision')).toBe(false);
    expect(isValidOu('')).toBe(false);
    expect(isValidOu('Riverstone')).toBe(false);
  });
});

/* ── Permission Enforcement (F-312 spec: edit from Envision → 403) ── */

describe('isOuOwner — permission boundary', () => {
  it('OU1 lead (Tom Rogers) owns pd_systems', () => {
    expect(isOuOwner('pd_systems', OU_OWNERS['pd_systems']!)).toBe(true);
  });

  it('OU2 lead (Derrick Elliot) owns riverstone', () => {
    expect(isOuOwner('riverstone', OU_OWNERS['riverstone']!)).toBe(true);
  });

  it('Envision user cannot edit riverstone (returns false → 403)', () => {
    const envisionUserId = '11111111-1111-1111-1111-111111111111';
    expect(isOuOwner('riverstone', envisionUserId)).toBe(false);
  });

  it('Envision user cannot edit pd_systems (returns false → 403)', () => {
    const envisionUserId = '11111111-1111-1111-1111-111111111111';
    expect(isOuOwner('pd_systems', envisionUserId)).toBe(false);
  });

  it('OU1 lead cannot edit OU2 profile (cross-OU blocked)', () => {
    expect(isOuOwner('riverstone', OU_OWNERS['pd_systems']!)).toBe(false);
  });

  it('OU2 lead cannot edit OU1 profile (cross-OU blocked)', () => {
    expect(isOuOwner('pd_systems', OU_OWNERS['riverstone']!)).toBe(false);
  });
});

/* ── Stale Flag (spec: > 90 days) ──────────────────────────────────── */

describe('isStale', () => {
  it('returns false for a date within 90 days', () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 30);
    expect(isStale(recent.toISOString())).toBe(false);
  });

  it('returns false at exactly 90 days', () => {
    const boundary = new Date();
    boundary.setDate(boundary.getDate() - 90);
    expect(isStale(boundary.toISOString())).toBe(false);
  });

  it('returns true for a date older than 90 days', () => {
    const old = new Date();
    old.setDate(old.getDate() - 91);
    expect(isStale(old.toISOString())).toBe(true);
  });

  it('returns true for very old dates', () => {
    expect(isStale('2020-01-01T00:00:00.000Z')).toBe(true);
  });
});

/* ── Citation Coverage (spec: every fact backed by evidence) ────────── */

describe('citation coverage — profile detail view carries source refs', () => {
  it('detail view has source citations on every sourced field', () => {
    const detail = toDetailView(RIVERSTONE_PROFILE);

    expect(detail.anchor_company_sources.length).toBeGreaterThan(0);
    expect(detail.anchor_company_sources[0]!.kind).toBe('sam_gov');

    expect(detail.primary_naics_sources.length).toBeGreaterThan(0);
    expect(detail.capabilities_sources.length).toBeGreaterThan(0);
    expect(detail.certifications_sources.length).toBeGreaterThan(0);
    expect(detail.past_performance_summary_sources.length).toBeGreaterThan(0);
  });

  it('capabilities_summary items expose evidence_doc_id field', () => {
    const detail = toDetailView(RIVERSTONE_PROFILE);
    for (const cap of detail.capabilities_summary) {
      expect(cap).toHaveProperty('evidence_doc_id');
    }
  });

  it('past_performance_detail items expose evidence_doc_id field', () => {
    const detail = toDetailView(RIVERSTONE_PROFILE);
    for (const pp of detail.past_performance_detail) {
      expect(pp).toHaveProperty('evidence_doc_id');
    }
  });

  it('list item includes is_stale flag', () => {
    const item = toListItem(RIVERSTONE_PROFILE);
    expect(item).toHaveProperty('is_stale');
    expect(typeof item.is_stale).toBe('boolean');
  });
});

/* ── Teaming Fit Scoring ───────────────────────────────────────────── */

describe('computeTeamingFitScore', () => {
  it('scores agency match for Riverstone + MDA opportunity', () => {
    const result = computeTeamingFitScore(RIVERSTONE_PROFILE, {
      agency: 'MDA',
      naics: null,
      set_aside: null,
      title: 'Missile Defense Support',
      description: null,
    });
    expect(result.fit_score).toBeGreaterThanOrEqual(30);
    expect(result.reasons.some((r) => r.includes('MDA'))).toBe(true);
    expect(result.cited_evidence.some((e) => e.kind === 'agency_match')).toBe(true);
  });

  it('scores NAICS match', () => {
    const result = computeTeamingFitScore(RIVERSTONE_PROFILE, {
      agency: null,
      naics: '541512',
      set_aside: null,
      title: 'IT Services',
      description: null,
    });
    expect(result.fit_score).toBeGreaterThanOrEqual(20);
    expect(result.cited_evidence.some((e) => e.kind === 'naics_match')).toBe(true);
  });

  it('scores HUBZone cert unlock for Riverstone', () => {
    const result = computeTeamingFitScore(RIVERSTONE_PROFILE, {
      agency: null,
      naics: null,
      set_aside: 'HUBZone Set-Aside',
      title: 'Support Services',
      description: null,
    });
    expect(result.fit_score).toBeGreaterThanOrEqual(25);
    expect(result.reasons.some((r) => r.includes('HUBZone'))).toBe(true);
    expect(result.cited_evidence.some((e) => e.kind === 'cert_unlock')).toBe(true);
  });

  it('scores capability overlap from description keywords', () => {
    const result = computeTeamingFitScore(PD_SYSTEMS_PROFILE, {
      agency: null,
      naics: null,
      set_aside: null,
      title: 'Immersive Training System Development',
      description: 'Develop XR/AR/VR training simulation for TRADOC',
    });
    expect(result.fit_score).toBeGreaterThan(0);
    expect(result.cited_evidence.some((e) => e.kind === 'capability_match')).toBe(true);
  });

  it('scores past performance at matching agency', () => {
    const result = computeTeamingFitScore(RIVERSTONE_PROFILE, {
      agency: 'MDA',
      naics: null,
      set_aside: null,
      title: 'Shield Support',
      description: null,
    });
    expect(result.cited_evidence.some((e) => e.kind === 'past_performance')).toBe(true);
  });

  it('returns zero for no-match opportunity', () => {
    const result = computeTeamingFitScore(RIVERSTONE_PROFILE, {
      agency: 'HHS',
      naics: '999999',
      set_aside: null,
      title: 'Healthcare Analytics',
      description: 'Public health data platform',
    });
    expect(result.fit_score).toBe(0);
    expect(result.reasons[0]).toContain('No significant alignment');
  });

  it('caps score at 100', () => {
    const result = computeTeamingFitScore(RIVERSTONE_PROFILE, {
      agency: 'MDA',
      naics: '541512',
      set_aside: 'HUBZone Set-Aside',
      title: 'DevSecOps Cyber SIGINT Platform for MDA classified environments',
      description: 'Requires TechSIGINT collection, classified DevSecOps CI/CD, and cyber operations support',
    });
    expect(result.fit_score).toBeLessThanOrEqual(100);
  });

  it('every cited_evidence entry has a source field', () => {
    const result = computeTeamingFitScore(RIVERSTONE_PROFILE, {
      agency: 'MDA',
      naics: '541512',
      set_aside: 'HUBZone Set-Aside',
      title: 'Cyber support',
      description: null,
    });
    for (const ev of result.cited_evidence) {
      expect(ev.source).toBeTruthy();
      expect(ev.kind).toBeTruthy();
      expect(ev.detail).toBeTruthy();
    }
  });
});

/* ── Schema / Structural Checks ────────────────────────────────────── */

describe('partner profile schema enforcement', () => {
  it('VALID_OUS contains exactly riverstone and pd_systems', () => {
    expect([...VALID_OUS].sort()).toEqual(['pd_systems', 'riverstone']);
  });

  it('every OU has a designated owner UUID', () => {
    for (const ou of VALID_OUS) {
      expect(OU_OWNERS[ou]).toBeTruthy();
      expect(OU_OWNERS[ou]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    }
  });

  it('ALLOWED_PATCH_FIELDS does not include restricted fields', () => {
    const restricted = ['ou', 'name', 'owner', 'active', 'last_reviewed_at'];
    for (const field of restricted) {
      expect(ALLOWED_PATCH_FIELDS).not.toContain(field);
    }
  });
});
