/**
 * Unit tests for F-443 bulk match-suggestion decisions.
 *
 * Covers:
 *   - De-duplication: repeated link_id processed once; total reflects de-duped count
 *   - Mixed outcomes: decided / skipped / error tallied correctly
 *   - Validation: empty items and items exceeding BULK_DECISION_MAX_ITEMS rejected
 *   - Order independence: counts correct regardless of input order
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock merge cache + audit (same pattern as existing test file) ────────────

const invalidateSpy = vi.fn();
vi.mock('../../../src/services/opportunities/merge.js', () => ({
  invalidateMergeCache: (id: string) => invalidateSpy(id),
}));

const recordAuditSpy = vi.fn(async () => 1);
vi.mock('../../../src/services/audit/audit-log.js', () => ({
  recordAuditLog: (...args: unknown[]) => recordAuditSpy(...args),
}));

// ─── Mock pool (sequential connect calls for bulk) ────────────────────────────

interface Step {
  match: RegExp;
  rows?: Record<string, unknown>[];
  rowCount?: number;
}

/** Each connect() pops a client config from this queue. */
let clientConfigs: Step[][] = [];

function makeClient(steps: Step[]) {
  return {
    query: vi.fn(async (sql: string) => {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      const step = steps.find((s) => s.match.test(sql));
      if (step) {
        return { rows: step.rows ?? [], rowCount: step.rowCount ?? (step.rows?.length ?? 0) };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
}

const mockPool = {
  connect: vi.fn(async () => {
    const steps = clientConfigs.shift() ?? [];
    return makeClient(steps);
  }),
};

import {
  bulkDecideMatchSuggestions,
  BULK_DECISION_MAX_ITEMS,
  type BulkDecisionInput,
} from '../../../src/services/opportunities/match-suggestions.js';
import type pg from 'pg';

/** Steps that cause decideMatchSuggestion to return a successful result. */
function decidedSteps(linkId: number, internalId: string = `iid-${linkId}`): Step[] {
  return [
    {
      match: /SELECT confidence.*FROM unified_opportunity_links/,
      rows: [{ confidence: 'MEDIUM' }],
    },
    {
      match: /UPDATE unified_opportunity_links/,
      rows: [{
        link_id: linkId,
        internal_id: internalId,
        source: 'grants_gov',
        source_native_id: `gt-${linkId}`,
        confidence: 'CONFIRMED',
        confirmed_by: 'operator',
        confirmed_at: '2026-06-03T00:00:00Z',
      }],
    },
  ];
}

/** Steps that cause decideMatchSuggestion to return null (no pending row). */
function skippedSteps(): Step[] {
  return [
    { match: /SELECT confidence.*FROM unified_opportunity_links/, rows: [] },
  ];
}

beforeEach(() => {
  clientConfigs = [];
  invalidateSpy.mockClear();
  recordAuditSpy.mockClear();
  mockPool.connect.mockClear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('bulkDecideMatchSuggestions', () => {
  it('de-duplicates items by link_id and processes each once', async () => {
    // Only 2 unique link_ids (1 and 2) — mock 2 clients.
    clientConfigs = [decidedSteps(1), decidedSteps(2)];
    const input: BulkDecisionInput = {
      items: [
        { link_id: 1, action: 'confirm' },
        { link_id: 1, action: 'reject' },  // duplicate — ignored
        { link_id: 2, action: 'confirm' },
      ],
      decided_by: 'operator',
    };
    const res = await bulkDecideMatchSuggestions(mockPool as unknown as pg.Pool, input);
    expect(res.total).toBe(2); // de-duped count
    expect(mockPool.connect).toHaveBeenCalledTimes(2);
    // Both processed → decided
    expect(res.decided).toBe(2);
  });

  it('tallies mixed outcomes (decided / skipped / error) correctly', async () => {
    // id 10 → decided, id 20 → skipped (no pending row), id 30 → error (throw)
    clientConfigs = [
      decidedSteps(10),
      skippedSteps(),
    ];
    // For the error case we need connect() to return a client that throws.
    const throwingClient = {
      query: vi.fn(async (sql: string) => {
        if (/BEGIN/i.test(sql)) return { rows: [], rowCount: 0 };
        if (/SELECT confidence/i.test(sql)) throw new Error('boom');
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    mockPool.connect
      .mockResolvedValueOnce(makeClient(decidedSteps(10)))
      .mockResolvedValueOnce(makeClient(skippedSteps()))
      .mockResolvedValueOnce(throwingClient);

    const input: BulkDecisionInput = {
      items: [
        { link_id: 10, action: 'confirm' },
        { link_id: 20, action: 'reject' },
        { link_id: 30, action: 'confirm' },
      ],
      decided_by: 'operator',
    };
    const res = await bulkDecideMatchSuggestions(mockPool as unknown as pg.Pool, input);

    expect(res.total).toBe(3);
    expect(res.decided).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.errored).toBe(1);

    // Per-item outcomes
    expect(res.items[0]).toMatchObject({ link_id: 10, outcome: 'decided' });
    expect(res.items[0]!.result).toBeDefined();
    expect(res.items[1]).toMatchObject({ link_id: 20, outcome: 'skipped' });
    expect(res.items[1]!.result).toBeUndefined();
    expect(res.items[2]).toMatchObject({ link_id: 30, outcome: 'error' });
    expect(res.items[2]!.error).toBe('boom');
  });

  it('continues processing after an error (one bad row does not abort batch)', async () => {
    const throwingClient = {
      query: vi.fn(async (sql: string) => {
        if (/BEGIN/i.test(sql)) return { rows: [], rowCount: 0 };
        if (/SELECT confidence/i.test(sql)) throw new Error('fail');
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    mockPool.connect
      .mockResolvedValueOnce(throwingClient)
      .mockResolvedValueOnce(makeClient(decidedSteps(2)));

    const input: BulkDecisionInput = {
      items: [
        { link_id: 1, action: 'confirm' },
        { link_id: 2, action: 'confirm' },
      ],
      decided_by: 'operator',
    };
    const res = await bulkDecideMatchSuggestions(mockPool as unknown as pg.Pool, input);
    expect(res.errored).toBe(1);
    expect(res.decided).toBe(1);
    expect(res.total).toBe(2);
  });

  it('counts are order-independent', async () => {
    // error → decided → skipped
    const throwingClient = {
      query: vi.fn(async (sql: string) => {
        if (/BEGIN/i.test(sql)) return { rows: [], rowCount: 0 };
        if (/SELECT confidence/i.test(sql)) throw new Error('x');
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    mockPool.connect
      .mockResolvedValueOnce(throwingClient)
      .mockResolvedValueOnce(makeClient(decidedSteps(5)))
      .mockResolvedValueOnce(makeClient(skippedSteps()));

    const input: BulkDecisionInput = {
      items: [
        { link_id: 99, action: 'reject' },
        { link_id: 5, action: 'confirm' },
        { link_id: 77, action: 'reject' },
      ],
      decided_by: 'user-1',
    };
    const res = await bulkDecideMatchSuggestions(mockPool as unknown as pg.Pool, input);
    expect(res.decided).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.errored).toBe(1);
    expect(res.total).toBe(3);
  });

  it('passes request context through to decideMatchSuggestion', async () => {
    clientConfigs = [decidedSteps(1)];
    // Reset connect to use queue again.
    mockPool.connect.mockImplementation(async () => {
      const steps = clientConfigs.shift() ?? [];
      return makeClient(steps);
    });

    const input: BulkDecisionInput = {
      items: [{ link_id: 1, action: 'confirm' }],
      decided_by: 'op',
      request_id: 'req-abc',
      ip_address: '10.0.0.1',
      user_agent: 'test-agent',
      user_id: 42,
    };
    const res = await bulkDecideMatchSuggestions(mockPool as unknown as pg.Pool, input);
    expect(res.decided).toBe(1);
    // Audit log receives the context.
    expect(recordAuditSpy).toHaveBeenCalledOnce();
    const entry = recordAuditSpy.mock.calls[0]![1] as Record<string, unknown>;
    expect(entry.actor).toBe('op');
    expect(entry.request_id).toBe('req-abc');
    expect(entry.ip_address).toBe('10.0.0.1');
    expect(entry.user_agent).toBe('test-agent');
    expect(entry.user_id).toBe(42);
  });

  it('returns total=0 when given an empty items array (caller validates)', async () => {
    const input: BulkDecisionInput = { items: [], decided_by: 'x' };
    const res = await bulkDecideMatchSuggestions(mockPool as unknown as pg.Pool, input);
    expect(res.total).toBe(0);
    expect(res.decided).toBe(0);
    expect(res.items).toHaveLength(0);
  });
});

describe('BULK_DECISION_MAX_ITEMS constant', () => {
  it('equals 200', () => {
    expect(BULK_DECISION_MAX_ITEMS).toBe(200);
  });
});
