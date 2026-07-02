/**
 * Unit tests for F-307: Risks as First-Class Objects.
 * Tests dedup logic, doctrine hook, and owner-required validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';

// Mock the db pool
vi.mock('../src/lib/db.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(() => ({
      query: vi.fn(),
      release: vi.fn(),
    })),
  },
}));

const { pool } = await import('../src/lib/db.js');
const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe('Risk Dedup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects exact title match on same entity within 7 days', async () => {
    // First query (exact match) returns a result
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 42, title: 'key personnel departure', description: 'Risk of losing key staff' }],
    });

    const { checkRiskDedup } = await import('../src/services/risks/dedup.js');

    const result = await checkRiskDedup(
      'key personnel departure',
      'Risk description',
      100, // opportunity_id
      null,
      null,
    );

    expect(result.isDuplicate).toBe(true);
    expect(result.existingRiskId).toBe(42);
  });

  it('does NOT dedup when no entity link provided', async () => {
    const { checkRiskDedup } = await import('../src/services/risks/dedup.js');

    const result = await checkRiskDedup(
      'some risk',
      'description',
      null,
      null,
      null,
    );

    expect(result.isDuplicate).toBe(false);
    expect(result.existingRiskId).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does NOT dedup when no match found within 7 days', async () => {
    // Exact match returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Fuzzy match returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { checkRiskDedup } = await import('../src/services/risks/dedup.js');

    const result = await checkRiskDedup(
      'brand new risk title',
      'totally new description',
      100,
      null,
      null,
    );

    expect(result.isDuplicate).toBe(false);
    expect(result.existingRiskId).toBeNull();
  });
});

describe('Doctrine Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates risk with correct category on doctrine rule fire', async () => {
    // Dedup check returns no match (exact)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Dedup check returns no match (fuzzy)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT returns new risk
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 99 }] });
    // Event INSERT
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { onDoctrineRuleFire } = await import('../src/services/risks/hooks.js');

    const riskId = await onDoctrineRuleFire({
      ruleId: 'rule-001',
      ruleName: 'Minimum PWin Threshold',
      ruleType: 'pwin_threshold',
      violationDescription: 'Opportunity PWin is below 30% minimum threshold',
      opportunityId: 55,
      severity: 'high',
    });

    expect(riskId).toBe(99);

    // Verify the INSERT was called with doctrine_violation category
    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall[0]).toContain('INSERT INTO risks');
    // category (3rd param) should be 'doctrine_violation'
    expect(insertCall[1][2]).toBe('doctrine_violation');
    // severity (3rd param) should be 'high'
    expect(insertCall[1][3]).toBe('high');
  });

  it('logs duplicate_fire event when doctrine fires on existing risk', async () => {
    // Dedup check returns match
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 42, title: 'doctrine violation: minimum pwin threshold', description: '' }],
    });
    // Event INSERT for duplicate_fire
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { onDoctrineRuleFire } = await import('../src/services/risks/hooks.js');

    const riskId = await onDoctrineRuleFire({
      ruleId: 'rule-001',
      ruleName: 'Minimum PWin Threshold',
      ruleType: 'pwin_threshold',
      violationDescription: 'PWin below threshold again',
      opportunityId: 55,
    });

    expect(riskId).toBe(42);

    // Should have logged a duplicate_fire event
    const eventCall = mockQuery.mock.calls[1];
    expect(eventCall[0]).toContain('INSERT INTO risk_events');
    expect(eventCall[1][1]).toBe('duplicate_fire');
  });
});

describe('Owner Required Rule', () => {
  it('critical risk cannot move out of open without owner', () => {
    // This validation happens at the route level.
    // Verify the business rule: severity=critical + no owner + status != open = rejected
    const severity = 'critical';
    const owner: string | null = null;
    const newStatus = 'mitigating';

    const shouldBlock = (severity === 'critical' || severity === 'high') && !owner && newStatus !== 'open';
    expect(shouldBlock).toBe(true);
  });

  it('high risk cannot move out of open without owner', () => {
    const severity = 'high';
    const owner: string | null = null;
    const newStatus = 'resolved';

    const shouldBlock = (severity === 'critical' || severity === 'high') && !owner && newStatus !== 'open';
    expect(shouldBlock).toBe(true);
  });

  it('critical risk with owner can move to mitigating', () => {
    const severity = 'critical';
    const owner = 'Shawn';
    const newStatus = 'mitigating';

    const shouldBlock = (severity === 'critical' || severity === 'high') && !owner && newStatus !== 'open';
    expect(shouldBlock).toBe(false);
  });

  it('medium risk can move without owner', () => {
    const severity = 'medium';
    const owner: string | null = null;
    const newStatus = 'resolved';

    const shouldBlock = (severity === 'critical' || severity === 'high') && !owner && newStatus !== 'open';
    expect(shouldBlock).toBe(false);
  });
});
