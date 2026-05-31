import { describe, it, expect } from 'vitest';
import {
  FR_AGENCY_SLUGS,
  buildSearchUrl,
} from '../../src/ingest/federal_register/client.js';

describe('FR_AGENCY_SLUGS', () => {
  it('contains all 9 curated agency slugs', () => {
    expect(FR_AGENCY_SLUGS).toHaveLength(9);
  });

  it('uses lowercase-hyphenated slug format (no spaces, no uppercase)', () => {
    for (const slug of FR_AGENCY_SLUGS) {
      expect(slug).toMatch(/^[a-z][a-z0-9-]+$/);
    }
  });

  it('includes defense-department', () => {
    expect(FR_AGENCY_SLUGS).toContain('defense-department');
  });

  it('does not contain invalid slugs like federal-acquisition-regulation', () => {
    expect(FR_AGENCY_SLUGS).not.toContain('federal-acquisition-regulation');
  });
});

describe('buildSearchUrl', () => {
  const fromDate = new Date('2026-01-15T00:00:00Z');

  it('emits one conditions[agencies][] key per slug (repeated keys)', () => {
    const url = buildSearchUrl(fromDate, 1);
    const params = new URL(url).searchParams;
    const agencyValues = params.getAll('conditions[agencies][]');

    expect(agencyValues).toHaveLength(FR_AGENCY_SLUGS.length);
    for (const slug of FR_AGENCY_SLUGS) {
      expect(agencyValues).toContain(slug);
    }
  });

  it('does not comma-join agencies into a single param value', () => {
    const url = buildSearchUrl(fromDate, 1);
    const params = new URL(url).searchParams;
    const agencyValues = params.getAll('conditions[agencies][]');

    for (const val of agencyValues) {
      expect(val).not.toContain(',');
    }
  });

  it('includes publication_date, per_page, page, and order params', () => {
    const url = buildSearchUrl(fromDate, 3);
    const params = new URL(url).searchParams;

    expect(params.get('conditions[publication_date][gte]')).toBe('2026-01-15');
    expect(params.get('per_page')).toBe('100');
    expect(params.get('page')).toBe('3');
    expect(params.get('order')).toBe('newest');
  });

  it('includes topic conditions', () => {
    const url = buildSearchUrl(fromDate, 1);
    const params = new URL(url).searchParams;
    const topics = params.getAll('conditions[topics][]');

    expect(topics).toContain('procurement');
    expect(topics).toContain('government-contracts');
    expect(topics).toContain('acquisition-regulations');
  });
});
