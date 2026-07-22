import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../src/lib/db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runFastracMatchGeneration } from '../../src/services/fastrac/match_generator.js';

function signal(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: '1', pipeline: 'tech', source: 'arXiv', title: 't', mission_tags: [],
    problem_tags: [], horizon: '6-12mo', signal_strength: 3, maturity: null,
    urgency: null, source_url: 'https://x', institution_name: null,
    published_at: null, transition_tags: [], ...over,
  };
}

/** Route pool.query by SQL shape: tech select, requirement select, or INSERT. */
function wire(solutions: Record<string, unknown>[], needs: Record<string, unknown>[]): void {
  query.mockImplementation((sql: unknown) => {
    const text = typeof sql === 'string' ? sql : String((sql as { text?: string })?.text ?? '');
    if (text.includes("pipeline = 'tech'")) return Promise.resolve({ rows: solutions });
    if (text.includes("pipeline = 'requirement'")) return Promise.resolve({ rows: needs });
    return Promise.resolve({ rows: [{ id: 1 }] }); // INSERT ... RETURNING
  });
}

describe('runFastracMatchGeneration', () => {
  beforeEach(() => query.mockReset());

  it('persists a match when a solution and need share a mission tag', async () => {
    wire(
      [signal({ id: '10', pipeline: 'tech', mission_tags: ['cyber'], source_url: 'https://arxiv/1' })],
      [signal({ id: '20', pipeline: 'requirement', mission_tags: ['cyber', 'general'], source_url: 'https://sam/1' })],
    );

    const result = await runFastracMatchGeneration();

    expect(result.matchesPersisted).toBe(1);
    const insertCall = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO fast_track_matches'));
    expect(insertCall).toBeTruthy();
    // tech_signal_id, req_signal_id are the first two params
    expect(insertCall?.[1]?.[0]).toBe('10');
    expect(insertCall?.[1]?.[1]).toBe('20');
  });

  it('does not let non-overlapping candidates crowd out a genuine match', async () => {
    // One overlapping need + many non-overlapping needs that still clear the
    // score floor (same horizon). The overlapping match must survive.
    const overlapping = signal({ id: '20', pipeline: 'requirement', mission_tags: ['cyber'], horizon: '6-12mo', source_url: 'https://sam/hit' });
    const noise = Array.from({ length: 30 }, (_, i) =>
      signal({ id: `9${i}`, pipeline: 'requirement', mission_tags: ['general'], horizon: '6-12mo', source_url: `https://sam/n${i}` }),
    );
    wire(
      [signal({ id: '10', pipeline: 'tech', mission_tags: ['cyber'], horizon: '6-12mo', source_url: 'https://arxiv/1' })],
      [...noise, overlapping],
    );

    const result = await runFastracMatchGeneration();

    expect(result.matchesPersisted).toBe(1);
    const insertCall = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO fast_track_matches'));
    expect(insertCall?.[1]?.[1]).toBe('20');
  });

  it('persists nothing when there is no shared mission tag', async () => {
    wire(
      [signal({ id: '10', pipeline: 'tech', mission_tags: ['space'], source_url: 'https://arxiv/1' })],
      [signal({ id: '20', pipeline: 'requirement', mission_tags: ['logistics'], source_url: 'https://sam/1' })],
    );

    const result = await runFastracMatchGeneration();

    expect(result.matchesPersisted).toBe(0);
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO fast_track_matches'))).toBe(false);
  });
});
