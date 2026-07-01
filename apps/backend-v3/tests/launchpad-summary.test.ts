import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';

const zeroRow = { rows: [{ count: '0' }] };

vi.mock('../src/lib/db.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue(zeroRow),
  },
}));

const { computeSummary } = await import('../src/services/launchpad/summary.js');

describe('Launchpad summary citations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 6 metrics each with a unique, non-placeholder title', async () => {
    const result = await computeSummary();

    const allTitles = [
      ...result.qualified_due_this_week_sources.map((s) => s.title),
      ...result.pipeline_no_capture_sources.map((s) => s.title),
      ...result.captures_color_review_stale_sources.map((s) => s.title),
      ...result.action_items_open_today_sources.map((s) => s.title),
      ...result.action_items_overdue_sources.map((s) => s.title),
      ...result.drafts_ready_for_review_sources.map((s) => s.title),
    ];

    expect(allTitles).toHaveLength(6);

    const unique = new Set(allTitles);
    expect(unique.size).toBe(6);
  });

  it('does NOT contain the deprecated placeholder string', async () => {
    const result = await computeSummary();

    const allTitles = [
      ...result.qualified_due_this_week_sources.map((s) => s.title),
      ...result.pipeline_no_capture_sources.map((s) => s.title),
      ...result.captures_color_review_stale_sources.map((s) => s.title),
      ...result.action_items_open_today_sources.map((s) => s.title),
      ...result.action_items_overdue_sources.map((s) => s.title),
      ...result.drafts_ready_for_review_sources.map((s) => s.title),
    ];

    for (const title of allTitles) {
      expect(title).not.toContain('GDA Command V3');
      expect(title).not.toContain('computed count');
    }
  });

  it('every citation uses kind = internal_query', async () => {
    const result = await computeSummary();

    const allKinds = [
      ...result.qualified_due_this_week_sources.map((s) => s.kind),
      ...result.pipeline_no_capture_sources.map((s) => s.kind),
      ...result.captures_color_review_stale_sources.map((s) => s.kind),
      ...result.action_items_open_today_sources.map((s) => s.kind),
      ...result.action_items_overdue_sources.map((s) => s.kind),
      ...result.drafts_ready_for_review_sources.map((s) => s.kind),
    ];

    for (const kind of allKinds) {
      expect(kind).toBe('internal_query');
    }
  });

  it('every citation has a valid retrieved_at ISO timestamp', async () => {
    const before = new Date().toISOString();
    const result = await computeSummary();
    const after = new Date().toISOString();

    const allRetrieved = [
      ...result.qualified_due_this_week_sources.map((s) => s.retrieved_at),
      ...result.pipeline_no_capture_sources.map((s) => s.retrieved_at),
      ...result.captures_color_review_stale_sources.map((s) => s.retrieved_at),
      ...result.action_items_open_today_sources.map((s) => s.retrieved_at),
      ...result.action_items_overdue_sources.map((s) => s.retrieved_at),
      ...result.drafts_ready_for_review_sources.map((s) => s.retrieved_at),
    ];

    for (const ts of allRetrieved) {
      expect(ts >= before).toBe(true);
      expect(ts <= after).toBe(true);
    }
  });

  it('each citation URL points to a drilldown route', async () => {
    const result = await computeSummary();

    const allUrls = [
      ...result.qualified_due_this_week_sources.map((s) => s.url),
      ...result.pipeline_no_capture_sources.map((s) => s.url),
      ...result.captures_color_review_stale_sources.map((s) => s.url),
      ...result.action_items_open_today_sources.map((s) => s.url),
      ...result.action_items_overdue_sources.map((s) => s.url),
      ...result.drafts_ready_for_review_sources.map((s) => s.url),
    ];

    for (const url of allUrls) {
      expect(url).toMatch(/^\/(opportunities|pipeline|capture|action-items)\?/);
    }
  });
});
