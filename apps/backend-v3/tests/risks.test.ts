import { describe, it, expect } from 'vitest';
import {
  validateStatusTransition,
  doctrineViolationCategory,
} from '../src/services/risks/index.js';

describe('validateStatusTransition', () => {
  it('blocks critical risk from leaving open without owner', () => {
    const err = validateStatusTransition('open', 'mitigating', 'critical', null);
    expect(err).toBe('Critical/high severity risks must have an owner before leaving open status');
  });

  it('blocks high risk from leaving open without owner', () => {
    const err = validateStatusTransition('open', 'resolved', 'high', null);
    expect(err).toBe('Critical/high severity risks must have an owner before leaving open status');
  });

  it('allows critical risk to leave open with owner', () => {
    const err = validateStatusTransition('open', 'mitigating', 'critical', 'Shawn');
    expect(err).toBeNull();
  });

  it('allows medium risk to leave open without owner', () => {
    const err = validateStatusTransition('open', 'mitigating', 'medium', null);
    expect(err).toBeNull();
  });

  it('allows low risk to leave open without owner', () => {
    const err = validateStatusTransition('open', 'resolved', 'low', null);
    expect(err).toBeNull();
  });

  it('allows staying in open without owner', () => {
    const err = validateStatusTransition('open', 'open', 'critical', null);
    expect(err).toBeNull();
  });

  it('allows non-open transitions without owner (already past open)', () => {
    const err = validateStatusTransition('mitigating', 'resolved', 'critical', null);
    expect(err).toBeNull();
  });
});

describe('doctrineViolationCategory', () => {
  it('maps alignment to doctrine_violation', () => {
    expect(doctrineViolationCategory('alignment')).toBe('doctrine_violation');
  });

  it('maps ethics to compliance', () => {
    expect(doctrineViolationCategory('ethics')).toBe('compliance');
  });

  it('maps teamwork to teaming', () => {
    expect(doctrineViolationCategory('teamwork')).toBe('teaming');
  });

  it('maps margin_floor to margin', () => {
    expect(doctrineViolationCategory('margin_floor')).toBe('margin');
  });

  it('maps relentless_execution to schedule', () => {
    expect(doctrineViolationCategory('relentless_execution')).toBe('schedule');
  });

  it('defaults unknown rule types to doctrine_violation', () => {
    expect(doctrineViolationCategory('unknown_type')).toBe('doctrine_violation');
  });
});
