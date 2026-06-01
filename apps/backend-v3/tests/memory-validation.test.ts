/**
 * F-302: Unit tests for decision memory validation.
 */

import { describe, it, expect } from 'vitest';
import { validateDecisionInput } from '../src/services/memory/index.js';
import type { DecisionCreateInput } from '../src/services/memory/types.js';

function makeInput(overrides: Partial<DecisionCreateInput> = {}): DecisionCreateInput {
  return {
    kind: 'qualify',
    entity_kind: 'opportunity',
    entity_id: '00000000-0000-0000-0000-000000000001',
    rationale: 'Strong match to Army RS3 scope',
    made_by: 'shawn',
    ...overrides,
  };
}

describe('validateDecisionInput', () => {
  it('returns null for valid input', () => {
    expect(validateDecisionInput(makeInput())).toBeNull();
  });

  it('rejects invalid kind', () => {
    const result = validateDecisionInput(makeInput({ kind: 'invalid' as DecisionCreateInput['kind'] }));
    expect(result).toContain('Invalid kind');
  });

  it('rejects invalid entity_kind', () => {
    const result = validateDecisionInput(makeInput({ entity_kind: 'invalid' as DecisionCreateInput['entity_kind'] }));
    expect(result).toContain('Invalid entity_kind');
  });

  it('rejects empty entity_id', () => {
    const result = validateDecisionInput(makeInput({ entity_id: '' }));
    expect(result).toContain('entity_id is required');
  });

  it('rejects empty rationale', () => {
    const result = validateDecisionInput(makeInput({ rationale: '' }));
    expect(result).toContain('rationale is required');
  });

  it('rejects whitespace-only rationale', () => {
    const result = validateDecisionInput(makeInput({ rationale: '   ' }));
    expect(result).toContain('rationale is required');
  });

  it('rejects empty made_by', () => {
    const result = validateDecisionInput(makeInput({ made_by: '' }));
    expect(result).toContain('made_by is required');
  });

  it('accepts all valid kinds', () => {
    const validKinds = [
      'qualify', 'kill', 'pass', 'bid', 'no_bid',
      'team_with', 'avoid_team', 'win', 'loss',
      'withdraw', 'exclusion_override',
    ] as const;

    for (const kind of validKinds) {
      expect(validateDecisionInput(makeInput({ kind }))).toBeNull();
    }
  });

  it('accepts all valid entity kinds', () => {
    const validEntityKinds = [
      'opportunity', 'pursuit', 'capture',
      'partner', 'document', 'pipeline_item',
    ] as const;

    for (const entity_kind of validEntityKinds) {
      expect(validateDecisionInput(makeInput({ entity_kind }))).toBeNull();
    }
  });

  it('accepts exclusion_override with all fields', () => {
    const result = validateDecisionInput(makeInput({
      kind: 'exclusion_override',
      exclusion_triggers: [{ exclusion_id: 'ex-1', override_rationale: 'CEO approved' }],
      doctrine_alignment_score: 35,
      margin_check: { passed: true, margin_pct: 15, threshold: 10 },
    }));
    expect(result).toBeNull();
  });
});
