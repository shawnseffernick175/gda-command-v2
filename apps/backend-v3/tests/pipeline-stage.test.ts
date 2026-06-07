import { describe, it, expect } from 'vitest';
import { normalizePipelineStage, pipelineStageToDisplay } from '../src/lib/pipeline-stage.js';

describe('normalizePipelineStage', () => {
  it('maps frontend labels to DB enums (case-insensitive)', () => {
    expect(normalizePipelineStage('Interest')).toBe('qualifying');
    expect(normalizePipelineStage('Qualified')).toBe('pursuit');
    expect(normalizePipelineStage('qualified')).toBe('pursuit');
    expect(normalizePipelineStage('QUALIFIED')).toBe('pursuit');
    expect(normalizePipelineStage('Capture')).toBe('proposal');
    expect(normalizePipelineStage('Proposal')).toBe('submitted');
    expect(normalizePipelineStage('Won')).toBe('won');
    expect(normalizePipelineStage('Lost')).toBe('lost');
    expect(normalizePipelineStage('No-Bid')).toBe('no_bid');
    expect(normalizePipelineStage('no-bid')).toBe('no_bid');
  });

  it('accepts DB enum values directly (unambiguous ones)', () => {
    expect(normalizePipelineStage('qualifying')).toBe('qualifying');
    expect(normalizePipelineStage('pursuit')).toBe('pursuit');
    expect(normalizePipelineStage('submitted')).toBe('submitted');
    expect(normalizePipelineStage('evaluation')).toBe('evaluation');
    expect(normalizePipelineStage('won')).toBe('won');
    expect(normalizePipelineStage('lost')).toBe('lost');
    expect(normalizePipelineStage('no_bid')).toBe('no_bid');
  });

  it('label mapping wins for "proposal" (frontend label → submitted)', () => {
    // "Proposal" is the frontend label for the DB enum "submitted"
    // Label mapping takes precedence over raw enum matching
    expect(normalizePipelineStage('proposal')).toBe('submitted');
  });

  it('returns null for unknown input', () => {
    expect(normalizePipelineStage('garbage')).toBeNull();
    expect(normalizePipelineStage('')).toBeNull();
    expect(normalizePipelineStage('  ')).toBeNull();
    expect(normalizePipelineStage('Awarded')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(normalizePipelineStage('  Won  ')).toBe('won');
    expect(normalizePipelineStage(' No-Bid ')).toBe('no_bid');
  });
});

describe('pipelineStageToDisplay', () => {
  it('maps DB enums to display labels', () => {
    expect(pipelineStageToDisplay('qualifying')).toBe('Interest');
    expect(pipelineStageToDisplay('pursuit')).toBe('Qualified');
    expect(pipelineStageToDisplay('proposal')).toBe('Capture');
    expect(pipelineStageToDisplay('submitted')).toBe('Proposal');
    expect(pipelineStageToDisplay('evaluation')).toBe('Evaluation');
    expect(pipelineStageToDisplay('won')).toBe('Won');
    expect(pipelineStageToDisplay('lost')).toBe('Lost');
    expect(pipelineStageToDisplay('no_bid')).toBe('No-Bid');
  });

  it('falls back to raw value for unknown enum', () => {
    expect(pipelineStageToDisplay('foo')).toBe('foo');
  });
});
