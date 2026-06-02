import { describe, it, expect } from 'vitest';
import { buildSourceUrl, sourceLabel, sourceKindOf, suggestionSourceRefs } from '../source-url';

describe('source-url (F-422)', () => {
  describe('buildSourceUrl', () => {
    it('builds canonical public URLs for addressable sources', () => {
      expect(buildSourceUrl('sam', 'ABC123')).toBe('https://sam.gov/opp/ABC123/view');
      expect(buildSourceUrl('govtribe', 'GT-1')).toBe(
        'https://govtribe.com/opportunity/federal-contract-opportunity/GT-1',
      );
      expect(buildSourceUrl('govwin', 'GW-9')).toBe('https://iq.govwin.com/neo/opportunity/view/GW-9');
    });

    it('encodes the native id', () => {
      expect(buildSourceUrl('sam', 'a b/c')).toBe('https://sam.gov/opp/a%20b%2Fc/view');
    });

    it('returns null for sources with no addressable public page', () => {
      expect(buildSourceUrl('fast_track', 'sig-1')).toBeNull();
      expect(buildSourceUrl('mystery', 'x')).toBeNull();
    });
  });

  // Regression (Devin finding #1): SourceRef.kind must use the canonical
  // SourceKind enum (sam_gov / govwin / govtribe / internal), never the raw
  // internal short name ('sam'). This mirrors the backend sourceKindOf and
  // keeps every SourceRef in the UI consistent with product_rules.md.
  describe('sourceKindOf', () => {
    it('maps internal short names to canonical SourceKinds', () => {
      expect(sourceKindOf('sam')).toBe('sam_gov');
      expect(sourceKindOf('govwin')).toBe('govwin');
      expect(sourceKindOf('govtribe')).toBe('govtribe');
    });

    it('maps fast_track and unknown sources to internal', () => {
      expect(sourceKindOf('fast_track')).toBe('internal');
      expect(sourceKindOf('whatever')).toBe('internal');
    });
  });

  describe('sourceLabel', () => {
    it('returns human labels, falling back to the raw name', () => {
      expect(sourceLabel('sam')).toBe('SAM.gov');
      expect(sourceLabel('unknown')).toBe('unknown');
    });
  });

  describe('suggestionSourceRefs', () => {
    it('returns a SourceRef with a canonical kind for addressable sources', () => {
      const refs = suggestionSourceRefs('sam', 'OPP-1', '2026-05-01T00:00:00Z');
      expect(refs).toHaveLength(1);
      expect(refs[0]?.kind).toBe('sam_gov');
      expect(refs[0]?.url).toBe('https://sam.gov/opp/OPP-1/view');
      expect(refs[0]?.retrieved_at).toBe('2026-05-01T00:00:00Z');
    });

    it('returns an empty array when the source has no URL', () => {
      expect(suggestionSourceRefs('fast_track', 'sig-1')).toEqual([]);
    });
  });
});
