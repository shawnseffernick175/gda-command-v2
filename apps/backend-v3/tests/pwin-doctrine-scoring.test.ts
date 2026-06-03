/**
 * F-451: Unit tests for scoreDoctrineFromContext — pure doctrine scoring (no DB).
 */

import { describe, it, expect } from 'vitest';
import { scoreDoctrineFromContext } from '../src/services/doctrine/evaluate.js';

describe('scoreDoctrineFromContext', () => {
  it('returns alignment_total between 0 and 40', () => {
    const result = scoreDoctrineFromContext({
      title: 'Logistics sustainment support',
      description: 'Army TACOM field service and systems engineering',
      agency: 'Department of the Army',
      naics: '541330',
      set_aside: null,
    });
    expect(result.alignment_total).toBeGreaterThanOrEqual(0);
    expect(result.alignment_total).toBeLessThanOrEqual(40);
  });

  it('produces deterministic results for identical input', () => {
    const ctx = {
      title: 'C5ISR integration',
      description: 'RS3 sustainment support for readiness',
      agency: 'Department of the Army',
      naics: '541715',
    };
    const r1 = scoreDoctrineFromContext(ctx);
    const r2 = scoreDoctrineFromContext(ctx);
    expect(r1.alignment_total).toBe(r2.alignment_total);
    expect(r1.exclusion_triggers).toEqual(r2.exclusion_triggers);
  });

  it('scores higher for aligned opportunities (NAICS in lane + army)', () => {
    const aligned = scoreDoctrineFromContext({
      title: 'Sustainment logistics',
      description: 'RS3 field service and maintenance for Army TACOM',
      agency: 'Department of the Army',
      naics: '541330',
    });
    const unaligned = scoreDoctrineFromContext({
      title: 'Commercial website',
      description: 'Build a marketing website',
      agency: 'Department of Education',
      naics: '999999',
    });
    expect(aligned.alignment_total).toBeGreaterThan(unaligned.alignment_total);
  });

  it('triggers exclusion for staff-aug-only scope', () => {
    const result = scoreDoctrineFromContext({
      description: 'Staff augmentation body shop labor hour support',
    });
    const triggered = result.exclusion_triggers.filter((e) => e.triggered);
    expect(triggered.length).toBeGreaterThan(0);
    expect(triggered.some((e) => e.id === 'staff_aug_only')).toBe(true);
  });

  it('does not trigger exclusions for normal opportunities', () => {
    const result = scoreDoctrineFromContext({
      title: 'Systems engineering support',
      description: 'Provide logistics and sustainment platform for Army readiness',
      agency: 'Department of the Army',
      naics: '541330',
    });
    const triggered = result.exclusion_triggers.filter((e) => e.triggered);
    expect(triggered.length).toBe(0);
  });

  it('handles empty/undefined context gracefully', () => {
    const result = scoreDoctrineFromContext({});
    expect(result.alignment_total).toBeGreaterThanOrEqual(0);
    expect(result.alignment_total).toBeLessThanOrEqual(40);
    expect(Array.isArray(result.exclusion_triggers)).toBe(true);
  });

  it('returns exclusion_triggers array with expected structure', () => {
    const result = scoreDoctrineFromContext({
      description: 'General services',
      agency: 'Department of the Army',
    });
    for (const excl of result.exclusion_triggers) {
      expect(excl).toHaveProperty('id');
      expect(excl).toHaveProperty('triggered');
      expect(excl).toHaveProperty('evidence');
      expect(typeof excl.triggered).toBe('boolean');
      expect(Array.isArray(excl.evidence)).toBe(true);
    }
  });
});
