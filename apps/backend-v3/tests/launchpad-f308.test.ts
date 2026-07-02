import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';

const emptyRows = { rows: [], rowCount: 0 };
const mockQuery = vi.fn().mockResolvedValue(emptyRows);

vi.mock('../src/lib/db.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

const { getDailyNews } = await import('../src/services/launchpad/daily-news.js');
const { getDay1Banners } = await import('../src/services/launchpad/day1-banners.js');

describe('F-308: Launchpad Daily News', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue(emptyRows);
  });

  // ── AC: Empty-day test ──────────────────────────────────────────
  describe('Empty-day test', () => {
    it('returns quiet_morning=true when no items meet threshold', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      const result = await getDailyNews({ limit: 15 });

      expect(result.quiet_morning).toBe(true);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.generated_at).toBeDefined();
    });

    it('returns quiet_morning=false when items exist', async () => {
      const newsItems = [
        {
          id: 1,
          source: 'sam',
          source_id: 'SAM-001',
          source_url: 'https://sam.gov/opp/001/view',
          title: 'Test SAM Opportunity',
          agency: 'DoD',
          dollar_value: '500000000',
          why_it_matters: 'Large DoD contract in target NAICS',
          relevance_score: 85,
          posted_at: new Date().toISOString(),
          ingested_at: new Date().toISOString(),
          naics_code: '541330',
          set_aside: null,
          doctrine_excluded: false,
        },
      ];
      mockQuery
        .mockResolvedValueOnce({ rows: newsItems, rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });

      const result = await getDailyNews({ limit: 15 });

      expect(result.quiet_morning).toBe(false);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Test SAM Opportunity');
      expect(result.items[0].source_url).toBe('https://sam.gov/opp/001/view');
    });
  });

  // ── AC: Doctrine filter test ────────────────────────────────────
  describe('Doctrine filter test', () => {
    it('filters out doctrine-excluded items by default', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 0 });

      const result = await getDailyNews({ limit: 15, showExcluded: false });

      const queryCalls = mockQuery.mock.calls;
      const selectQuery = queryCalls[0][0] as string;
      expect(selectQuery).toContain('doctrine_excluded = FALSE');
      expect(result.items).toHaveLength(0);
    });

    it('includes doctrine-excluded items when showExcluded=true', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 0 });

      const result = await getDailyNews({ limit: 15, showExcluded: true });

      const queryCalls = mockQuery.mock.calls;
      const selectQuery = queryCalls[0][0] as string;
      expect(selectQuery).not.toContain('doctrine_excluded = FALSE');
      expect(result.items).toHaveLength(0);
    });
  });

  // ── Day-1 Banners ───────────────────────────────────────────────
  describe('Day-1 Banners', () => {
    it('returns max 3 banners', async () => {
      const result = await getDay1Banners();

      expect(result.banners).toBeInstanceOf(Array);
      expect(result.banners.length).toBeLessThanOrEqual(3);
      expect(result.generated_at).toBeDefined();

      const queryCalls = mockQuery.mock.calls;
      const bannerQuery = queryCalls[0][0] as string;
      expect(bannerQuery).toContain('LIMIT 3');
      expect(bannerQuery).toContain('is_day1_banner = TRUE');
    });
  });

  // ── R1: Source citation ─────────────────────────────────────────
  describe('R1 source citation', () => {
    it('every news item includes source_url (per R1)', async () => {
      const newsItems = [
        {
          id: 1,
          source: 'sam',
          source_id: 'SAM-001',
          source_url: 'https://sam.gov/opp/001/view',
          title: 'Test',
          agency: 'DoD',
          dollar_value: null,
          why_it_matters: null,
          relevance_score: 50,
          posted_at: new Date().toISOString(),
          ingested_at: new Date().toISOString(),
          naics_code: null,
          set_aside: null,
          doctrine_excluded: false,
        },
      ];
      mockQuery
        .mockResolvedValueOnce({ rows: newsItems, rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });

      const result = await getDailyNews({ limit: 15 });
      for (const item of result.items) {
        expect(item).toHaveProperty('source_url');
        expect(item).toHaveProperty('source');
      }
    });
  });
});

// ── AC: OrangeSlices-suppression test ────────────────────────────
describe('F-308: OrangeSlices suppression', () => {
  /**
   * Strip block comments and line comments so we only scan
   * actual executable code for OrangeSlices references.
   */
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');
  }

  it('no executable code path references OrangeSlices as a data source', async () => {
    const { readFileSync, readdirSync } = await import('fs');
    const { join, resolve } = await import('path');

    const launchpadDir = resolve(
      import.meta.dirname ?? __dirname,
      '../src/services/launchpad',
    );

    const files = readdirSync(launchpadDir).filter(
      (f) => f.endsWith('.ts') || f.endsWith('.js'),
    );

    for (const file of files) {
      const raw = readFileSync(join(launchpadDir, file), 'utf8');
      const code = stripComments(raw).toLowerCase();
      expect(code).not.toContain('orangeslices');
      expect(code).not.toContain('orange_slices');
      expect(code).not.toContain('orange-slices');
    }
  });

  it('pre-warm worker has no OrangeSlices fetch/parse/feed in executable code', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');

    const preWarmPath = resolve(
      import.meta.dirname ?? __dirname,
      '../src/services/launchpad/pre-warm.ts',
    );
    const raw = readFileSync(preWarmPath, 'utf8');
    const code = stripComments(raw).toLowerCase();

    expect(code).not.toContain('orangeslices');
    expect(code).not.toContain('orange_slices');
    expect(code).not.toContain('orange-slices');
  });

  it('no import or require of anything OrangeSlices-related', async () => {
    const { readFileSync, readdirSync } = await import('fs');
    const { join, resolve } = await import('path');

    const launchpadDir = resolve(
      import.meta.dirname ?? __dirname,
      '../src/services/launchpad',
    );

    const files = readdirSync(launchpadDir).filter(
      (f) => f.endsWith('.ts') || f.endsWith('.js'),
    );

    for (const file of files) {
      const content = readFileSync(join(launchpadDir, file), 'utf8');
      const importLines = content
        .split('\n')
        .filter((line) => line.match(/^\s*(import|require)\s/));
      for (const line of importLines) {
        const lower = line.toLowerCase();
        expect(lower).not.toContain('orangeslice');
        expect(lower).not.toContain('orange_slice');
        expect(lower).not.toContain('orange-slice');
      }
    }
  });
});
