/**
 * Unit tests for evaluateRelevance -- PR-A4 relevance gate.
 */

import { describe, it, expect } from 'vitest';
import { evaluateRelevance, ENVISION_SET_ASIDES, AUTO_PASS_DAYS_THRESHOLD } from '../src/constants/relevance.js';

describe('evaluateRelevance', () => {
  const farFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const in20Days = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
  const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

  it('marks in-NAICS opp with >30d deadline as relevant', () => {
    const result = evaluateRelevance({
      naics: '541330',
      set_aside: 'SDB',
      response_due_at: farFuture,
    });
    expect(result.status).toBe('relevant');
    expect(result.relevant).toBe(true);
    expect(result.auto_pass).toBe(false);
    expect(result.reason).toContain('541330');
    expect(result.reason).toContain('set_aside_fit');
  });

  it('marks off-NAICS opp as off_profile', () => {
    const result = evaluateRelevance({
      naics: '999999',
      set_aside: null,
      response_due_at: farFuture,
    });
    expect(result.status).toBe('off_profile');
    expect(result.relevant).toBe(false);
    expect(result.auto_pass).toBe(false);
    expect(result.reason).toContain('999999');
    expect(result.reason).toContain('not in Envision');
  });

  it('marks null NAICS as unknown_naics', () => {
    const result = evaluateRelevance({
      naics: null,
      set_aside: 'SB',
      response_due_at: farFuture,
    });
    expect(result.status).toBe('unknown_naics');
    expect(result.relevant).toBe(false);
    expect(result.auto_pass).toBe(false);
  });

  it('marks empty-string NAICS as unknown_naics', () => {
    const result = evaluateRelevance({
      naics: '  ',
      set_aside: null,
      response_due_at: farFuture,
    });
    expect(result.status).toBe('unknown_naics');
  });

  it('marks in-NAICS opp with <30d deadline as auto_pass', () => {
    const result = evaluateRelevance({
      naics: '541512',
      set_aside: null,
      response_due_at: in20Days,
    });
    expect(result.status).toBe('auto_pass');
    expect(result.relevant).toBe(true);
    expect(result.auto_pass).toBe(true);
    expect(result.reason).toContain('auto_pass');
  });

  it('marks in-NAICS opp that is past due as auto_pass', () => {
    const result = evaluateRelevance({
      naics: '541511',
      set_aside: null,
      response_due_at: yesterday,
    });
    expect(result.status).toBe('auto_pass');
    expect(result.relevant).toBe(true);
    expect(result.auto_pass).toBe(true);
    expect(result.reason).toContain('past due');
  });

  it('uses due_date fallback when response_due_at is null', () => {
    const result = evaluateRelevance({
      naics: '541330',
      set_aside: null,
      response_due_at: null,
      due_date: yesterday,
    });
    expect(result.status).toBe('auto_pass');
    expect(result.auto_pass).toBe(true);
  });

  it('marks in-NAICS opp with no deadline as relevant (not auto_pass)', () => {
    const result = evaluateRelevance({
      naics: '541330',
      set_aside: null,
      response_due_at: null,
    });
    expect(result.status).toBe('relevant');
    expect(result.relevant).toBe(true);
    expect(result.auto_pass).toBe(false);
  });

  it('exports ENVISION_SET_ASIDES with expected members', () => {
    expect(ENVISION_SET_ASIDES.has('SDB')).toBe(true);
    expect(ENVISION_SET_ASIDES.has('8(a)')).toBe(true);
    expect(ENVISION_SET_ASIDES.has('Small Business')).toBe(true);
  });

  it('exports AUTO_PASS_DAYS_THRESHOLD = 30', () => {
    expect(AUTO_PASS_DAYS_THRESHOLD).toBe(30);
  });
});
