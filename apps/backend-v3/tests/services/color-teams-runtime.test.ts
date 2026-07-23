import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['JWT_SECRET'] = 'test-secret-at-least-32-characters-long-xx';

vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// LLM router — controlled per test.
const routeMock = vi.fn();
vi.mock('../../src/lib/llm-router.js', () => ({
  llmRouter: { route: (...args: unknown[]) => routeMock(...args) },
}));

// Document parser — controlled per test.
const parseFileMock = vi.fn();
vi.mock('../../src/services/rag/parser.js', () => ({
  parseFile: (...args: unknown[]) => parseFileMock(...args),
}));

// Doctrine engine — deterministic, controlled per test.
const evaluateDoctrineDetailMock = vi.fn();
const getConfigValueMock = vi.fn();
vi.mock('../../src/services/doctrine/evaluate.js', () => ({
  evaluateDoctrineDetail: (...args: unknown[]) => evaluateDoctrineDetailMock(...args),
}));
vi.mock('../../src/services/doctrine/config.js', () => ({
  getConfigValue: (...args: unknown[]) => getConfigValueMock(...args),
}));

import { runColorTeamAnalysis } from '../../src/services/color-teams/runtime.js';
import type { ColorTeamRunRow } from '../../src/services/color-teams/types.js';

interface PoolRows {
  document?: Record<string, unknown> | null;
  opportunity?: Record<string, unknown> | null;
  scenario?: Record<string, unknown> | null;
  indirect?: Record<string, unknown> | null;
}

function makePool(rows: PoolRows) {
  return {
    query: vi.fn((sql: string) => {
      const s = String(sql);
      if (s.includes('FROM documents')) return Promise.resolve({ rows: rows.document ? [rows.document] : [] });
      if (s.includes('FROM opportunities')) return Promise.resolve({ rows: rows.opportunity ? [rows.opportunity] : [] });
      if (s.includes('FROM pricing_scenarios')) return Promise.resolve({ rows: rows.scenario ? [rows.scenario] : [] });
      if (s.includes('FROM financial_indirects')) return Promise.resolve({ rows: rows.indirect ? [rows.indirect] : [] });
      return Promise.resolve({ rows: [] });
    }),
  };
}

function run(overrides: Partial<ColorTeamRunRow> = {}): ColorTeamRunRow {
  return {
    id: 'run-1',
    document_id: 'doc-1',
    linked_rfp_id: null,
    colors: ['pink'],
    status: 'running',
    triggered_by: 'user-1',
    started_at: '2026-07-22T00:00:00Z',
    completed_at: null,
    error_message: null,
    source_id: null,
    created_at: '2026-07-22T00:00:00Z',
    ...overrides,
  };
}

const DOC = { id: 'doc-1', filename: 'proposal.pdf', storage_path: 'proposal.pdf' };

function okReview(findings: unknown[]) {
  return { ok: true, output: { findings }, model_used: 'mock', latency_ms: 1, trace_id: 't' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPool = (p: ReturnType<typeof makePool>) => p as any;

beforeEach(() => {
  routeMock.mockReset();
  parseFileMock.mockReset();
  evaluateDoctrineDetailMock.mockReset();
  getConfigValueMock.mockReset();
  getConfigValueMock.mockResolvedValue(8);
});

describe('runColorTeamAnalysis — document handling', () => {
  it('throws when the document is missing (no findings fabricated)', async () => {
    const pool = makePool({ document: null });
    await expect(runColorTeamAnalysis(asPool(pool), run())).rejects.toThrow(/not found/i);
  });

  it('throws when the document text is empty/unreadable', async () => {
    parseFileMock.mockResolvedValue({ text: '   ' });
    const pool = makePool({ document: DOC });
    await expect(runColorTeamAnalysis(asPool(pool), run())).rejects.toThrow(/empty or unreadable/i);
  });

  it('throws when the parser fails', async () => {
    parseFileMock.mockRejectedValue(new Error('bad pdf'));
    const pool = makePool({ document: DOC });
    await expect(runColorTeamAnalysis(asPool(pool), run())).rejects.toThrow(/could not be read/i);
  });

  it('refuses to read a document path outside the allowed root (no arbitrary file read)', async () => {
    parseFileMock.mockResolvedValue({ text: 'root:x:0:0' });
    const pool = makePool({ document: { id: 'doc-1', filename: 'passwd', storage_path: '/etc/passwd' } });
    await expect(runColorTeamAnalysis(asPool(pool), run())).rejects.toThrow(/not permitted/i);
    // The escaping path must never reach the parser.
    expect(parseFileMock).not.toHaveBeenCalled();
  });

  it('refuses a traversal path that escapes the root', async () => {
    parseFileMock.mockResolvedValue({ text: 'secret' });
    const pool = makePool({ document: { id: 'doc-1', filename: 's', storage_path: '../../../../etc/shadow' } });
    await expect(runColorTeamAnalysis(asPool(pool), run())).rejects.toThrow(/not permitted/i);
    expect(parseFileMock).not.toHaveBeenCalled();
  });
});

describe('runColorTeamAnalysis — qualitative findings + citations', () => {
  beforeEach(() => parseFileMock.mockResolvedValue({ text: 'Section 3.2 discusses the approach in detail.' }));

  it('produces findings grounded in a real document citation', async () => {
    routeMock.mockResolvedValue(
      okReview([{ severity: 'warning', section_ref: 'Section 3.2', finding: 'Win theme is buried.', recommended_fix: 'Move it up.' }])
    );
    const drafts = await runColorTeamAnalysis(asPool(makePool({ document: DOC })), run({ colors: ['pink'] }));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.color).toBe('pink');
    expect(drafts[0]!.citations).toEqual([{ source: 'proposal.pdf', url: '/documents/doc-1', grade: 'A' }]);
    // No fabricated/placeholder citation URLs.
    for (const c of drafts[0]!.citations!) {
      expect(c.url).not.toBe('#');
      expect(c.url).not.toContain('gda-command.internal');
    }
  });

  it('throws when the LLM call errors', async () => {
    routeMock.mockResolvedValue({ ok: false, error_message: 'timeout', output: null });
    await expect(runColorTeamAnalysis(asPool(makePool({ document: DOC })), run())).rejects.toThrow(/LLM analysis failed/i);
  });

  it('rejects malformed output (findings not an array)', async () => {
    routeMock.mockResolvedValue({ ok: true, output: { findings: 'nope' } });
    await expect(runColorTeamAnalysis(asPool(makePool({ document: DOC })), run())).rejects.toThrow(/malformed/i);
  });

  it('rejects an invalid severity', async () => {
    routeMock.mockResolvedValue(okReview([{ severity: 'high', finding: 'x', section_ref: null, recommended_fix: null }]));
    await expect(runColorTeamAnalysis(asPool(makePool({ document: DOC })), run())).rejects.toThrow(/invalid severity/i);
  });

  it('rejects a finding with no text', async () => {
    routeMock.mockResolvedValue(okReview([{ severity: 'info', finding: '   ', section_ref: null, recommended_fix: null }]));
    await expect(runColorTeamAnalysis(asPool(makePool({ document: DOC })), run())).rejects.toThrow(/no text/i);
  });
});

describe('runColorTeamAnalysis — green deterministic analysis', () => {
  beforeEach(() => {
    parseFileMock.mockResolvedValue({ text: 'Executive summary and pricing narrative.' });
    routeMock.mockResolvedValue(okReview([])); // no qualitative green findings
  });

  it('marks pricing/doctrine unavailable (not a pass) when there is no linked RFP', async () => {
    const drafts = await runColorTeamAnalysis(asPool(makePool({ document: DOC })), run({ colors: ['green'] }));
    const green = drafts.find((d) => d.pricing_strategy);
    expect(green).toBeDefined();
    expect(green!.doctrine_score).toBeNull();
    expect(green!.margin_check).toBeNull();
    expect(green!.pricing_strategy!.status).toBe('unavailable');
    expect(green!.pricing_strategy!.missing_inputs.length).toBeGreaterThan(0);
    expect(evaluateDoctrineDetailMock).not.toHaveBeenCalled();
    // No fabricated numbers.
    expect(JSON.stringify(green)).not.toContain('6.5');
  });

  it('computes a deterministic margin PASS from a real pricing scenario', async () => {
    evaluateDoctrineDetailMock.mockResolvedValue({
      principles: [{ id: 'alignment', name: 'Alignment' }],
      principle_scores: { alignment: { score: 4, rationale: 'Strong NAICS fit', evidence_grade: 'A', citations: [] } },
      exclusion_triggers: [{ id: 'below_margin_floor', name: 'Below Margin Floor', triggered: false, evidence: [], override_available: true }],
      alignment_total: 4,
      source: 'configured',
    });
    const pool = makePool({
      document: DOC,
      opportunity: { id: '42', title: 'Cyber IDIQ', agency: 'DoD', description: 'x' },
      scenario: { id: 'sc-1', margin_pct: 12, total_price: 1000000, fee_pct: 7, contract_type: 'FFP', bible_version_id: 'bv-1' },
      indirect: { contract_type: 'FFP', fringe_pct: 30, overhead_pct: 20, ga_pct: 10, fee_band_low: 6, fee_band_high: 9 },
    });
    const drafts = await runColorTeamAnalysis(asPool(pool), run({ colors: ['green'], linked_rfp_id: '42' }));
    const green = drafts.find((d) => d.margin_check)!;
    expect(green.margin_check).toEqual({ projected_margin: 12, floor: 8, pass: true, source: 'pricing_scenario:sc-1' });
    // Doctrine score derived from the mocked deterministic score (4/5 → 80), not the LLM.
    expect(green.doctrine_score).toEqual([{ principle: 'Alignment', score: 80, detail: 'Strong NAICS fit' }]);
    expect(green.pricing_strategy!.status).toBe('available');
    // Every pricing fact carries a source (R1).
    for (const f of green.pricing_strategy!.sourced_facts) {
      expect(f.source).toBeTruthy();
    }
  });

  it('flags a margin FAIL below the configured floor with posture recommendations', async () => {
    evaluateDoctrineDetailMock.mockResolvedValue({
      principles: [], principle_scores: {}, exclusion_triggers: [], alignment_total: 0, source: 'default',
    });
    const pool = makePool({
      document: DOC,
      opportunity: { id: '42', title: 'X', agency: 'Y', description: 'z' },
      scenario: { id: 'sc-2', margin_pct: 5, total_price: 500000, fee_pct: 6, contract_type: 'FFP', bible_version_id: 'bv-1' },
      indirect: { contract_type: 'FFP', fringe_pct: 30, overhead_pct: 20, ga_pct: 10, fee_band_low: 6, fee_band_high: 9 },
    });
    const drafts = await runColorTeamAnalysis(asPool(pool), run({ colors: ['green'], linked_rfp_id: '42' }));
    const green = drafts.find((d) => d.margin_check)!;
    expect(green.margin_check!.pass).toBe(false);
    expect(green.severity).toBe('critical');
    expect(green.pricing_strategy!.recommendations.length).toBeGreaterThan(0);
  });

  it('marks green a blocker when a doctrine exclusion is triggered', async () => {
    evaluateDoctrineDetailMock.mockResolvedValue({
      principles: [], principle_scores: {},
      exclusion_triggers: [{ id: 'ou2_out_of_lane', name: 'OU2 Out of Lane', triggered: true, evidence: ['x'], override_available: false }],
      alignment_total: 0, source: 'configured',
    });
    const pool = makePool({ document: DOC, opportunity: { id: '9', title: 'X' } });
    const drafts = await runColorTeamAnalysis(asPool(pool), run({ colors: ['green'], linked_rfp_id: '9' }));
    const green = drafts.find((d) => d.exclusion_hits)!;
    expect(green.exclusion_hits).toEqual(['OU2 Out of Lane']);
    expect(green.severity).toBe('blocker');
  });
});
