import { describe, it, expect } from 'vitest';

/**
 * Regression (#1145): GovWin returns an empty OBJECT `{}` (not `[]`) for the
 * companies/contracts sub-endpoints of FBO-namespace opportunities. The
 * extractor must coerce any non-array shape to [] so iteration never throws
 * "list is not iterable".
 */
function extractList(data: any): any[] {
  const resolved = Array.isArray(data)
    ? data
    : data.companies ??
      data.relatedCompanies ??
      data.data ??
      data.results ??
      data.items ??
      data.content ??
      [];
  return Array.isArray(resolved) ? resolved : [];
}

describe('govwin sub-endpoint non-array guard (#1145)', () => {
  it('coerces empty-object companies ({}) to [] without throwing', () => {
    expect(() => extractList({ companies: {} })).not.toThrow();
    expect(extractList({ companies: {} })).toEqual([]);
  });
  it('preserves a real companies array', () => {
    expect(extractList({ companies: [{ name: 'UNIVERSITY OF KENTUCKY' }] })).toHaveLength(1);
  });
  it('handles a bare array payload', () => {
    expect(extractList([{ name: 'X' }])).toHaveLength(1);
  });
  it('handles a totally empty object', () => {
    expect(extractList({})).toEqual([]);
  });
});
