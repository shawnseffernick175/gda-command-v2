import { beforeEach, describe, expect, it, vi } from 'vitest';

// recordSentinelEvent runs a dedup SELECT then an INSERT. Capture both.
const query = vi.fn();

vi.mock('../../src/lib/db.js', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Stubbed summary so each test controls exactly what summarizeEvent returns.
const summarize = vi.fn();
vi.mock('../../src/services/sentinel/summarize-event.js', () => ({
  summarizeEvent: (...a: unknown[]) => summarize(...a),
}));

function findInsert(): { sql: string; params: unknown[] } {
  const call = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO sentinel_events'));
  if (!call) throw new Error('INSERT was never issued');
  return { sql: String(call[0]), params: call[1] as unknown[] };
}

describe('recordSentinelEvent — constraint-safe insert (Sentinel blindness fix)', () => {
  beforeEach(() => {
    vi.resetModules();
    query.mockReset();
    summarize.mockReset();
    // Dedup SELECT returns no existing rows; INSERT returns a new id.
    query.mockImplementation((sql: string) =>
      String(sql).includes('INSERT')
        ? Promise.resolve({ rows: [{ id: 'evt-1' }] })
        : Promise.resolve({ rows: [] }),
    );
  });

  it('coerces an off-enum LLM severity to a CHECK-valid value', async () => {
    // LLMs routinely emit 'high'/'medium', which violate the severity CHECK and
    // used to make the INSERT throw (then get swallowed → no event recorded).
    summarize.mockResolvedValue({
      title: 'GovWin discovery failed',
      context: 'Retry on next cycle',
      severity: 'high',
      action_label: null,
      action_url: null,
    });

    const { recordSentinelEvent } = await import('../../src/services/sentinel/hooks.js');
    const id = await recordSentinelEvent({
      event_type: 'break',
      source_key: 'govwin',
      alert_type: 'degraded',
      component: 'govwin',
      details: 'API discovery failed',
    });

    expect(id).toBe('evt-1');
    const { params } = findInsert();
    // params: [event_type, severity, source_key, title, ...]
    expect(params[1]).toBe('warning');
  });

  it('falls back to details when the summary title is empty (NOT NULL guard)', async () => {
    summarize.mockResolvedValue({
      title: '   ',
      context: null,
      severity: 'warning',
      action_label: null,
      action_url: null,
    });

    const { recordSentinelEvent } = await import('../../src/services/sentinel/hooks.js');
    await recordSentinelEvent({
      event_type: 'break',
      source_key: 'sam.gov',
      alert_type: 'api_error',
      component: 'sam.gov',
      details: 'The operation was aborted due to timeout',
    });

    const { params } = findInsert();
    expect(params[3]).toBe('The operation was aborted due to timeout');
  });

  it('keeps valid severities untouched and still inserts', async () => {
    summarize.mockResolvedValue({
      title: 'Auth failed',
      context: 'Rotate token',
      severity: 'critical',
      action_label: 'Re-authenticate',
      action_url: null,
    });

    const { recordSentinelEvent } = await import('../../src/services/sentinel/hooks.js');
    await recordSentinelEvent({
      event_type: 'handoff',
      source_key: 'govwin',
      alert_type: 'auth_failure',
      component: 'govwin',
      details: '401 unauthorized',
    });

    const { params } = findInsert();
    expect(params[1]).toBe('critical');
    expect(params[3]).toBe('Auth failed');
  });
});
