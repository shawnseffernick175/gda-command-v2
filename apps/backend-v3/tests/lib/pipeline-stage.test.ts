import { describe, it, expect } from 'vitest';
import {
  normalizePipelineStage,
  pipelineStageToDisplay,
  CANONICAL_STAGE_KEYS,
  ACTIVE_STAGE_KEYS,
} from '../../src/lib/pipeline-stage.js';

describe('pipeline-stage canonical model', () => {
  describe('CANONICAL_STAGE_KEYS', () => {
    it('contains exactly 9 canonical stages', () => {
      expect(CANONICAL_STAGE_KEYS).toHaveLength(9);
    });

    it('has the expected order', () => {
      expect(CANONICAL_STAGE_KEYS).toEqual([
        'interest', 'qualify', 'pursue', 'solicitation', 'post_submittal',
        'won', 'lost', 'no_bid', 'gov_cancelled',
      ]);
    });
  });

  describe('ACTIVE_STAGE_KEYS', () => {
    it('contains exactly the 5 active stages', () => {
      expect(ACTIVE_STAGE_KEYS).toEqual([
        'interest', 'qualify', 'pursue', 'solicitation', 'post_submittal',
      ]);
    });
  });

  describe('normalizePipelineStage', () => {
    it('round-trips every canonical DB key', () => {
      for (const key of CANONICAL_STAGE_KEYS) {
        expect(normalizePipelineStage(key)).toBe(key);
      }
    });

    it('accepts display labels', () => {
      const cases: Array<[string, string]> = [
        ['Interest', 'interest'],
        ['Qualify', 'qualify'],
        ['Pursue', 'pursue'],
        ['Solicitation', 'solicitation'],
        ['Post-Submittal', 'post_submittal'],
        ['Won', 'won'],
        ['Lost', 'lost'],
        ['No Bid', 'no_bid'],
        ['Government Cancelled', 'gov_cancelled'],
      ];
      for (const [input, expected] of cases) {
        expect(normalizePipelineStage(input)).toBe(expected);
      }
    });

    it('accepts aliases', () => {
      expect(normalizePipelineStage('Qualified')).toBe('qualify');
      expect(normalizePipelineStage('Pursuit')).toBe('pursue');
      expect(normalizePipelineStage('Submitted')).toBe('post_submittal');
      expect(normalizePipelineStage('Post Submittal')).toBe('post_submittal');
      expect(normalizePipelineStage('No-Bid')).toBe('no_bid');
      expect(normalizePipelineStage('Gov Cancelled')).toBe('gov_cancelled');
      expect(normalizePipelineStage('Cancelled')).toBe('gov_cancelled');
    });

    it('is case-insensitive', () => {
      expect(normalizePipelineStage('INTEREST')).toBe('interest');
      expect(normalizePipelineStage('POST-SUBMITTAL')).toBe('post_submittal');
      expect(normalizePipelineStage('no bid')).toBe('no_bid');
    });

    it('treats hyphens, underscores, and spaces as equivalent', () => {
      expect(normalizePipelineStage('post_submittal')).toBe('post_submittal');
      expect(normalizePipelineStage('post-submittal')).toBe('post_submittal');
      expect(normalizePipelineStage('post submittal')).toBe('post_submittal');
    });

    it('returns null for unknown input', () => {
      expect(normalizePipelineStage('foo')).toBeNull();
      expect(normalizePipelineStage('')).toBeNull();
      expect(normalizePipelineStage('discovery')).toBeNull();
    });
  });

  describe('pipelineStageToDisplay', () => {
    it('maps every canonical key to its display label', () => {
      const expected: Record<string, string> = {
        interest: 'Interest',
        qualify: 'Qualify',
        pursue: 'Pursue',
        solicitation: 'Solicitation',
        post_submittal: 'Post-Submittal',
        won: 'Won',
        lost: 'Lost',
        no_bid: 'No Bid',
        gov_cancelled: 'Government Cancelled',
      };
      for (const key of CANONICAL_STAGE_KEYS) {
        expect(pipelineStageToDisplay(key)).toBe(expected[key]);
      }
    });

    it('falls back to raw value for unknown keys', () => {
      expect(pipelineStageToDisplay('unknown_stage')).toBe('unknown_stage');
    });
  });
});
