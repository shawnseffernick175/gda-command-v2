/**
 * Regression tests for the Cost Service Centers feature (Financial Bible).
 *
 * parseServiceCenterGlDetail  — aggregates the YTD GL Detail's INDIRECT side into
 *   per-service-center monthly cost. It must: filter to INDIRECT only, key by
 *   (FY, PD, Project ID, PAG), preserve service-center name / Org ID / PAG, read
 *   Amount from the END of each row so comma-shifted ("ragged") rows parse, and
 *   emit one row per month present (never a single filename-derived period).
 *
 * parsePoolRateSummary        — extracts the Trend SIE "Trend Rate Summary" pool
 *   rates: one row per pool per month plus a YTD row (month_num=null) carrying the
 *   ACT-YTD and PROV-YTD rates.
 *
 * classifyFinancialDoc        — a GL Detail must route to is_gl_service_center and
 *   a Trend SIE to is_sie (which drives the pool-rate parser), without either
 *   being fed to the generic P&L parser.
 *
 * Fixtures are the REAL trimmed vault extracts (comma-delimited "[Sheet: X]"
 * format the RAG parseXlsx produces), reused from the existing GL Detail / Trend
 * SIE fixtures — so these assert against finance's own books, not the parser
 * against itself.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseServiceCenterGlDetail,
  parsePoolRateSummary,
} from '../../src/services/financials/deterministic-parsers.js';
import { classifyFinancialDoc } from '../../src/services/financials/reingest-doc.js';

const ET = join(__dirname, '../fixtures/financials/extracted_text');
const glText = readFileSync(join(ET, 'gl-detail-ytd-may-2026.extracted.txt'), 'utf8');
const sieText = readFileSync(join(ET, 'trend-sie-may-2026.extracted.txt'), 'utf8');

describe('parseServiceCenterGlDetail (YTD GL Detail — INDIRECT service centers)', () => {
  const out = parseServiceCenterGlDetail(glText, 'YTD MAY-2026 GL Detail.xlsx');

  it('returns rows only for INDIRECT postings', () => {
    expect(out).not.toBeNull();
    expect(out!.rows.length).toBeGreaterThan(0);
    for (const r of out!.rows) expect(r.classification).toBe('INDIRECT');
  });

  it('preserves service-center identity from the source (id, name, pool, org)', () => {
    const r = out!.rows[0];
    expect(r.service_center_id).toBe('ADMN.GNA');
    expect(r.service_center_name).toBe('G&A');
    expect(r.pool).toBe('G&A');
    expect(r.org_id).toBe('1.01.90.01');
    expect(r.fiscal_year).toBe(2026);
  });

  it('emits one aggregated row per period present (PD1..PD5), not a single filename period', () => {
    const months = [...new Set(out!.rows.map((r) => r.month_num))].sort((a, b) => a - b);
    expect(months).toEqual([1, 2, 3, 4, 5]);
  });

  it('aggregates the two January INDIRECT postings and reads Amount from the ragged row end', () => {
    // Jan ADMN.GNA = Shared G&A Labor 16212.46 + Shared G&A Non Labor 10885.47.
    const jan = out!.rows.find((r) => r.month_num === 1 && r.service_center_id === 'ADMN.GNA');
    expect(jan).toBeDefined();
    expect(jan!.amount).toBeCloseTo(27097.93, 2);
  });

  it('sets period label and quarter from the fiscal period', () => {
    const jan = out!.rows.find((r) => r.month_num === 1)!;
    expect(jan.period).toBe('FY26 Jan');
    expect(jan.quarter).toBe(1);
    const may = out!.rows.find((r) => r.month_num === 5)!;
    expect(may.quarter).toBe(2);
  });
});

describe('parsePoolRateSummary (Trend SIE — Trend Rate Summary)', () => {
  const out = parsePoolRateSummary(sieText, 'Trend SIE MAY-2026.xlsx');

  it('extracts pool rows including a YTD (month_num=null) summary row per pool', () => {
    expect(out).not.toBeNull();
    expect(out!.rows.length).toBeGreaterThan(0);
    const ytd = out!.rows.filter((r) => r.month_num === null);
    expect(ytd.length).toBeGreaterThanOrEqual(5);
  });

  it('carries the ACT-YTD and PROV-YTD rates from the source', () => {
    const fringe = out!.rows.find((r) => r.month_num === null && /fringe/i.test(r.pool_name));
    expect(fringe).toBeDefined();
    expect(fringe!.actual_rate).toBeCloseTo(0.3524, 3);
    expect(fringe!.provisional_rate).toBeCloseTo(0.3119, 3);
    const gna = out!.rows.find((r) => r.month_num === null && /g&a|g and a/i.test(r.pool_name));
    expect(gna).toBeDefined();
    expect(gna!.provisional_rate).toBeCloseTo(0.1486, 3);
  });
});

describe('classifyFinancialDoc routing (service centers / pool rates)', () => {
  it('routes a YTD GL Detail to the service-center parser (not the generic P&L parser)', () => {
    const cls = classifyFinancialDoc('YTD MAY-2026 GL Detail.xlsx', glText);
    expect(cls.is_gl_service_center).toBe(true);
    expect(cls.is_financial).toBe(false);
  });

  it('routes a Trend SIE to is_sie (which drives the pool-rate parser)', () => {
    const cls = classifyFinancialDoc('Trend SIE MAY-2026.xlsx', sieText);
    expect(cls.is_sie).toBe(true);
    expect(cls.is_financial).toBe(false);
  });
});
