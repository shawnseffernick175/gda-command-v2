/**
 * Unit tests for the F capture-phase entry gate + audited override in
 * `promoteToPipeline`.
 *
 * Covers:
 *   - system owner rejected (pre-existing guard)
 *   - override requires a non-empty reason (pre-DB validation)
 *   - qualify-first gate blocks ineligible opps when NOT overriding
 *   - eligible (relevant) opp promotes and audits `promote_to_pipeline`
 *   - ineligible opp with override promotes and audits
 *     `promote_to_pipeline_override` (records reason + bypassed statuses)
 *   - existing pipeline card → no duplicate, no override needed
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────
const recordAuditSpy = vi.fn(async () => 1);
vi.mock('../../src/services/audit/audit-log.js', () => ({
  recordAuditLog: (...args: unknown[]) => recordAuditSpy(...args),
}));

interface Step {
  match: RegExp;
  rows?: Record<string, unknown>[];
}

let steps: Step[] = [];
let executed: string[] = [];

function makeClient() {
  return {
    query: vi.fn(async (sql: string) => {
      executed.push(sql.trim().split('\n')[0]!.trim());
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      const step = steps.find((s) => s.match.test(sql));
      if (!step) throw new Error('Unexpected SQL: ' + sql.slice(0, 60));
      return { rows: step.rows ?? [], rowCount: step.rows?.length ?? 0 };
    }),
    release: vi.fn(),
  };
}

let client: ReturnType<typeof makeClient>;
const mockPool = { connect: vi.fn(async () => client) };

vi.mock('../../src/lib/db.js', () => ({
  pool: { connect: (...a: unknown[]) => mockPool.connect(...a) },
}));

import { promoteToPipeline, PromoteError } from '../../src/services/assessment/views.js';

/** Standard happy-path query script; opp row is caller-supplied. */
function scriptFor(opp: Record<string, unknown>, existingCard: Record<string, unknown>[] = []) {
  steps = [
    { match: /FROM opportunities\s+WHERE id = \$1/i, rows: [opp] },
    { match: /FROM pipeline_items WHERE opportunity_id/i, rows: existingCard },
    { match: /UPDATE opportunities SET status = 'qualified'/i, rows: [] },
    { match: /INSERT INTO sources/i, rows: [{ id: '900' }] },
    { match: /INSERT INTO pipeline_items/i, rows: [{ id: '42' }] },
  ];
}

beforeEach(() => {
  steps = [];
  executed = [];
  client = makeClient();
  mockPool.connect.mockClear();
  recordAuditSpy.mockClear();
});

describe('promoteToPipeline — owner + override validation', () => {
  it('rejects a system owner before touching the DB', async () => {
    await expect(promoteToPipeline('1', 'system', null, 'pursue')).rejects.toBeInstanceOf(PromoteError);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it('requires a non-empty reason when overriding', async () => {
    await expect(
      promoteToPipeline('1', 'shawn', null, 'pursue', { override: true, reason: '   ' }),
    ).rejects.toThrow(/override_reason is required/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });
});

describe('promoteToPipeline — qualify-first gate', () => {
  it('blocks an ineligible opp when not overriding (409-mapped 400)', async () => {
    scriptFor({ id: '1', assessment_status: 'passed', relevance_status: 'off_profile', source_id: '5' });
    await expect(promoteToPipeline('1', 'shawn', null, 'pursue')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(recordAuditSpy).not.toHaveBeenCalled();
  });

  it('promotes an eligible (relevant) opp and audits promote_to_pipeline', async () => {
    scriptFor({ id: '1', assessment_status: 'passed', relevance_status: 'relevant', source_id: '5' });
    const res = await promoteToPipeline('1', 'shawn', null, 'pursue');
    expect(res.created).toBe(true);
    expect(recordAuditSpy).toHaveBeenCalledTimes(1);
    const audit = recordAuditSpy.mock.calls[0]![1] as Record<string, unknown>;
    expect(audit.action).toBe('promote_to_pipeline');
    expect((audit.new_values as Record<string, unknown>).override_reason).toBeUndefined();
  });
});

describe('promoteToPipeline — audited override', () => {
  it('bypasses the gate and records who/why on override', async () => {
    scriptFor({ id: '1', assessment_status: 'passed', relevance_status: 'off_profile', source_id: '5' });
    const res = await promoteToPipeline('1', 'shawn', null, 'pursue', {
      override: true,
      reason: 'Executive directed pursuit ahead of formal qualification',
    });
    expect(res.created).toBe(true);
    expect(recordAuditSpy).toHaveBeenCalledTimes(1);
    const audit = recordAuditSpy.mock.calls[0]![1] as Record<string, unknown>;
    expect(audit.action).toBe('promote_to_pipeline_override');
    expect(audit.actor).toBe('shawn');
    const nv = audit.new_values as Record<string, unknown>;
    expect(nv.override_reason).toBe('Executive directed pursuit ahead of formal qualification');
    expect(nv.bypassed_relevance_status).toBe('off_profile');
    expect(nv.bypassed_assessment_status).toBe('passed');
    expect(nv.stage).toBe('pursue');
  });

  it('does NOT flag override when the opp already passes the gate', async () => {
    scriptFor({ id: '1', assessment_status: 'ops_tracker', relevance_status: null, source_id: '5' });
    await promoteToPipeline('1', 'shawn', null, 'pursue', { override: true, reason: 'redundant override' });
    const audit = recordAuditSpy.mock.calls[0]![1] as Record<string, unknown>;
    expect(audit.action).toBe('promote_to_pipeline');
  });
});

describe('promoteToPipeline — existing card', () => {
  it('returns the existing card without creating a duplicate or auditing', async () => {
    scriptFor(
      { id: '1', assessment_status: 'passed', relevance_status: 'off_profile', source_id: '5' },
      [{ id: '7', capture_owner: 'shawn' }],
    );
    const res = await promoteToPipeline('1', 'shawn', null, 'pursue', { override: true, reason: 'n/a here' });
    expect(res.created).toBe(false);
    expect(res.pipeline_item_id).toBe('7');
    expect(recordAuditSpy).not.toHaveBeenCalled();
  });
});
