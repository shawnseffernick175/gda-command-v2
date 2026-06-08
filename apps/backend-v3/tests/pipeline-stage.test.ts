import { describe, it, expect } from 'vitest';
import { normalizePipelineStage, pipelineStageToDisplay, CANONICAL_STAGE_KEYS } from '../src/lib/pipeline-stage.js';

describe('normalizePipelineStage', () => {
  it('maps canonical display labels to DB keys (case-insensitive)', () => {
    expect(normalizePipelineStage('Interest')).toBe('interest');
    expect(normalizePipelineStage('Qualify')).toBe('qualify');
    expect(normalizePipelineStage('qualify')).toBe('qualify');
    expect(normalizePipelineStage('QUALIFY')).toBe('qualify');
    expect(normalizePipelineStage('Pursue')).toBe('pursue');
    expect(normalizePipelineStage('Solicitation')).toBe('solicitation');
    expect(normalizePipelineStage('Post-Submittal')).toBe('post_submittal');
    expect(normalizePipelineStage('Won')).toBe('won');
    expect(normalizePipelineStage('Lost')).toBe('lost');
    expect(normalizePipelineStage('No Bid')).toBe('no_bid');
    expect(normalizePipelineStage('No-Bid')).toBe('no_bid');
    expect(normalizePipelineStage('Government Cancelled')).toBe('gov_cancelled');
  });

  it('accepts DB keys directly', () => {
    for (const key of CANONICAL_STAGE_KEYS) {
      expect(normalizePipelineStage(key)).toBe(key);
    }
  });

  it('accepts common aliases', () => {
    expect(normalizePipelineStage('Qualified')).toBe('qualify');
    expect(normalizePipelineStage('Pursuit')).toBe('pursue');
    expect(normalizePipelineStage('Submitted')).toBe('post_submittal');
    expect(normalizePipelineStage('Post Submittal')).toBe('post_submittal');
    expect(normalizePipelineStage('Gov Cancelled')).toBe('gov_cancelled');
    expect(normalizePipelineStage('Cancelled')).toBe('gov_cancelled');
  });

  it('returns null for unknown input', () => {
    expect(normalizePipelineStage('garbage')).toBeNull();
    expect(normalizePipelineStage('')).toBeNull();
    expect(normalizePipelineStage('  ')).toBeNull();
    expect(normalizePipelineStage('Awarded')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(normalizePipelineStage('  Won  ')).toBe('won');
    expect(normalizePipelineStage(' No Bid ')).toBe('no_bid');
  });
});

describe('pipelineStageToDisplay', () => {
  it('maps all canonical DB keys to display labels', () => {
    expect(pipelineStageToDisplay('interest')).toBe('Interest');
    expect(pipelineStageToDisplay('qualify')).toBe('Qualify');
    expect(pipelineStageToDisplay('pursue')).toBe('Pursue');
    expect(pipelineStageToDisplay('solicitation')).toBe('Solicitation');
    expect(pipelineStageToDisplay('post_submittal')).toBe('Post-Submittal');
    expect(pipelineStageToDisplay('won')).toBe('Won');
    expect(pipelineStageToDisplay('lost')).toBe('Lost');
    expect(pipelineStageToDisplay('no_bid')).toBe('No Bid');
    expect(pipelineStageToDisplay('gov_cancelled')).toBe('Government Cancelled');
  });

  it('falls back to raw value for unknown key', () => {
    expect(pipelineStageToDisplay('foo')).toBe('foo');
  });
});
