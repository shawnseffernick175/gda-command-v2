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

  it('stays healthy on an empty poll when it inserted rows within the window', () => {
    expect(
      deriveStatus({ latest: run({ status: 'success', rows_inserted: 0 }), lastInsertAt: new Date(NOW - 2 * HOUR).toISOString(), everInserted: true, intervalHours: 6, hasRecentError: false, now: NOW }),
    ).toBe('healthy');
  });

  it('is stale when a source that returns rows has not inserted within the window', () => {
    // interval 6h, factor 2 -> 12h window; last insert 30h ago.
    expect(
      deriveStatus({ latest: run({ status: 'success', rows_inserted: 0 }), lastInsertAt: new Date(NOW - 30 * HOUR).toISOString(), everInserted: true, intervalHours: 6, hasRecentError: false, now: NOW }),
    ).toBe('stale');
  });

  it('is degraded when it historically returns rows but has never had a tracked insert', () => {
    expect(
      deriveStatus({ latest: run({ status: 'success', rows_inserted: 0 }), lastInsertAt: null, everInserted: true, intervalHours: 6, hasRecentError: false, now: NOW }),
    ).toBe('degraded');
  });

  it('is healthy for a source that legitimately never inserts and ran recently', () => {
    expect(
      deriveStatus({ latest: run({ status: 'success', rows_inserted: 0 }), lastInsertAt: null, everInserted: false, intervalHours: 6, hasRecentError: false, now: NOW }),
    ).toBe('healthy');
  });
});
