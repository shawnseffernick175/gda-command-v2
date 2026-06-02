/**
 * Unit tests for the F-420a (R1) source-url / SourceKind helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  sourceKindOf,
  sourceLabelOf,
  buildSourceUrl,
  buildFieldSourceRefs,
} from '../../src/lib/source-urls.js';

describe('sourceKindOf', () => {
  it('maps internal source names to canonical SourceKind', () => {
    expect(sourceKindOf('sam')).toBe('sam_gov');
    expect(sourceKindOf('govwin')).toBe('govwin');
    expect(sourceKindOf('govtribe')).toBe('govtribe');
    expect(sourceKindOf('fast_track')).toBe('internal');
    expect(sourceKindOf('something-else')).toBe('internal');
  });
});

describe('sourceLabelOf', () => {
  it('returns human labels', () => {
    expect(sourceLabelOf('sam')).toBe('SAM.gov');
    expect(sourceLabelOf('govwin')).toBe('GovWin IQ');
    expect(sourceLabelOf('govtribe')).toBe('GovTribe');
    expect(sourceLabelOf('fast_track')).toBe('GDA Fast Track');
    expect(sourceLabelOf('mystery')).toBe('mystery');
  });
});

describe('buildSourceUrl', () => {
  it('builds SAM.gov opportunity URLs', () => {
    expect(buildSourceUrl('sam', 'N-123')).toBe('https://sam.gov/opp/N-123/view');
  });

  it('builds GovTribe URLs', () => {
    expect(buildSourceUrl('govtribe', 'GT-9')).toBe(
      'https://govtribe.com/opportunity/federal-contract-opportunity/GT-9',
    );
  });

  it('builds GovWin URLs', () => {
    expect(buildSourceUrl('govwin', 'G-7')).toBe(
      'https://iq.govwin.com/neo/opportunity/view/G-7',
    );
  });

  it('url-encodes native ids', () => {
    expect(buildSourceUrl('sam', 'a b/c')).toBe('https://sam.gov/opp/a%20b%2Fc/view');
  });

  it('returns null for fast_track and unknown sources', () => {
    expect(buildSourceUrl('fast_track', 'FT-1')).toBeNull();
    expect(buildSourceUrl('unknown', 'X')).toBeNull();
  });
});

describe('buildFieldSourceRefs', () => {
  const links = [
    { source: 'sam', source_native_id: 'N-1' },
    { source: 'govtribe', source_native_id: 'GT-2' },
    { source: 'fast_track', source_native_id: 'FT-3' },
  ];

  it('returns a single SourceRef for an addressable source', () => {
    const refs = buildFieldSourceRefs('sam', links);
    expect(refs).toHaveLength(1);
    expect(refs[0].kind).toBe('sam_gov');
    expect(refs[0].title).toBe('SAM.gov');
    expect(refs[0].url).toBe('https://sam.gov/opp/N-1/view');
    expect(typeof refs[0].retrieved_at).toBe('string');
  });

  it('returns [] when source is null', () => {
    expect(buildFieldSourceRefs(null, links)).toEqual([]);
  });

  it('returns [] when the source has no matching link', () => {
    expect(buildFieldSourceRefs('govwin', links)).toEqual([]);
  });

  it('returns [] for fast_track (no addressable URL)', () => {
    expect(buildFieldSourceRefs('fast_track', links)).toEqual([]);
  });
});
