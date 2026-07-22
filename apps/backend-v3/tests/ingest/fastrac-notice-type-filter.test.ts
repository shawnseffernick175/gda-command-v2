import { describe, expect, it } from 'vitest';
import { classifyNoticeType } from '../../src/ingest/fastrac/notice-type-filter.js';

describe('classifyNoticeType — FasTrac pre-SAM boundary', () => {
  it('keeps pre-solicitation leading indicators', () => {
    for (const t of ['Sources Sought', 'Presolicitation', 'Special Notice']) {
      expect(classifyNoticeType(t).rejected).toBe(false);
    }
  });

  it('rejects formal / post-solicitation notice types', () => {
    for (const t of ['Solicitation', 'Combined Synopsis/Solicitation', 'Award Notice', 'Justification']) {
      expect(classifyNoticeType(t).rejected).toBe(true);
    }
  });

  it('does not misclassify presolicitation as the formal "solicitation" type', () => {
    expect(classifyNoticeType('Presolicitation').category).toBe('presolicitation');
    expect(classifyNoticeType('Solicitation').category).toBe('solicitation');
  });

  it('fails open on blank/unknown types', () => {
    expect(classifyNoticeType(null).rejected).toBe(false);
    expect(classifyNoticeType('').rejected).toBe(false);
    expect(classifyNoticeType('Some New Type').rejected).toBe(false);
  });
});
