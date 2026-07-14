import { describe, it, expect } from 'vitest';
import { deriveStatus, type LatestRun } from '../../src/routes/ingest-status.js';

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-07-13T20:00:00Z');

function run(overrides: Partial<LatestRun>): LatestRun {
  return {
    status: 'success',
    rows_inserted: 0,
    rows_updated: 0,
    rows_skipped: 0,
    started_at: new Date(NOW).toISOString(),
    finished_at: new Date(NOW).toISOString(),
    error_text: null,
    log_lines: null,
    ...overrides,
  };
}

describe('deriveStatus', () => {
  it('is unknown when the source has never run', () => {
    expect(
      deriveStatus({ latest: undefined, lastInsertAt: null, everInserted: false, intervalHours: 6, hasRecentError: false, now: NOW }),
    ).toBe('unknown');
  });

  it('is error when the latest run threw', () => {
    expect(
      deriveStatus({ latest: run({ status: 'error', error_text: 'HTTP 401' }), lastInsertAt: null, everInserted: true, intervalHours: 6, hasRecentError: false, now: NOW }),
    ).toBe('error');
  });

  it('is degraded when the latest run was caught/degraded (e.g. GovWin 401 → 0 rows)', () => {
    // Historically returned rows, still has an old successful insert, but the
    // cron now reports degraded — must NOT be healthy.
    expect(
      deriveStatus({
        latest: run({ status: 'degraded', error_text: 'API discovery failed: GovWin API error: HTTP 401' }),
        lastInsertAt: new Date(NOW - HOUR).toISOString(),
        everInserted: true,
        intervalHours: 6,
        hasRecentError: false,
        now: NOW,
      }),
    ).toBe('degraded');
  });

  it('is healthy when the latest successful run returned data', () => {
    expect(
      deriveStatus({ latest: run({ status: 'success', rows_inserted: 5 }), lastInsertAt: new Date(NOW).toISOString(), everInserted: true, intervalHours: 6, hasRecentError: false, now: NOW }),
    ).toBe('healthy');
  });

  it('is degraded when the latest run returned zero rows after historical inserts', () => {
    expect(
      deriveStatus({ latest: run({ status: 'success', rows_inserted: 0 }), lastInsertAt: new Date(NOW - 2 * HOUR).toISOString(), everInserted: true, intervalHours: 6, hasRecentError: false, now: NOW }),
    ).toBe('degraded');
  });

  it('is stale when the latest run returned data but no insert occurred within the expected interval', () => {
    expect(
      deriveStatus({ latest: run({ status: 'success', rows_skipped: 4 }), lastInsertAt: new Date(NOW - 7 * HOUR).toISOString(), everInserted: true, intervalHours: 6, hasRecentError: false, now: NOW }),
    ).toBe('stale');
  });

  it('is degraded when it returned data but has never had a tracked insert', () => {
    expect(
      deriveStatus({ latest: run({ status: 'success', rows_skipped: 4 }), lastInsertAt: null, everInserted: false, intervalHours: 6, hasRecentError: false, now: NOW }),
    ).toBe('degraded');
  });

  it('is degraded when a source has never inserted and the latest run returned zero rows', () => {
    expect(
      deriveStatus({ latest: run({ status: 'success', rows_inserted: 0 }), lastInsertAt: null, everInserted: false, intervalHours: 6, hasRecentError: false, now: NOW }),
    ).toBe('degraded');
  });
});
