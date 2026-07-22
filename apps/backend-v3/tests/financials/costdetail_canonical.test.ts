/**
 * F-1142 cost_detail single-source-of-truth regression tests.
 *
 * The ingestion cure let multiple source docs feed cost_detail_actuals with the
 * same direct-cost figures under different labels/pools, and the raw element
 * labels never matched the Income Statement's eight canonical lines (so every
 * cost-of-revenue row rendered "—"). These tests pin the canonical mapping and
 * the reconciliation guard: the eight lines for a month MUST sum to that month's
 * Total Direct Costs and no cost_element may appear twice.
 */
import { describe, it, expect } from 'vitest';
import {
  canonicalDirectCostElement,
  aggregateDirectCostRows,
  ownedCostDetailMonths,
  CANONICAL_DIRECT_COST_LINES,
} from '../../src/services/financials/deterministic-parsers.js';

type Raw = Parameters<typeof aggregateDirectCostRows>[0][number];
const row = (cost_element: string, pool: string, actual: number): Raw => ({
  period: 'FY26 Jan',
  fiscal_year: 2026,
  quarter: 1,
  cost_element,
  pool,
  target_amount: 0,
  actual_amount: actual,
});

describe('canonicalDirectCostElement — raw variant -> statement line', () => {
  it('maps every known direct-cost variant to a frontend detailKey', () => {
    expect(canonicalDirectCostElement('Direct Labor ONSITE')).toBe('DL Onsite');
    expect(canonicalDirectCostElement('500-501 Direct Labor Onsite')).toBe('DL Onsite');
    expect(canonicalDirectCostElement('Direct Labor OFFSITE')).toBe('DL Offsite');
    expect(canonicalDirectCostElement('Subcontractor Labor')).toBe('Subcontractor');
    expect(canonicalDirectCostElement('Subcontractor')).toBe('Subcontractor');
    expect(canonicalDirectCostElement('Consultant Labor')).toBe('Consultant');
    expect(canonicalDirectCostElement('Direct Consultants')).toBe('Consultant');
    expect(canonicalDirectCostElement('Direct Travel')).toBe('Dir Travel');
    expect(canonicalDirectCostElement('Subcontractor Travel')).toBe('Dir Travel');
    expect(canonicalDirectCostElement('Subcontractor Materials')).toBe('Sub Material');
    expect(canonicalDirectCostElement('Sub Material')).toBe('Sub Material');
    expect(canonicalDirectCostElement('Direct Materials')).toBe('Direct Material');
    expect(canonicalDirectCostElement('Other Direct Cost')).toBe('ODC');
    expect(canonicalDirectCostElement('ODC')).toBe('ODC');
  });

  it('drops non cost-of-revenue rows (indirect, account-code, balance-sheet junk, subtotals)', () => {
    expect(canonicalDirectCostElement('Payroll Labor')).toBeNull();
    expect(canonicalDirectCostElement('Due From PD Systems')).toBeNull();
    expect(canonicalDirectCostElement('118-001')).toBeNull();
    expect(canonicalDirectCostElement('MSB Operating')).toBeNull();
    expect(canonicalDirectCostElement('Total Direct Costs')).toBeNull();
    expect(canonicalDirectCostElement('')).toBeNull();
  });
});

describe('aggregateDirectCostRows — DIRECT-only, deduped, reconciling', () => {
  // Real FY26 Jan direct-cost accounts from the Trended IS DETAIL grid, plus the
  // duplicate/junk rows the cure was double-counting.
  const rows: Raw[] = [
    row('Direct Labor OFFSITE', 'DIRECT', 61199.42),
    row('Direct Labor ONSITE', 'DIRECT', 402373.61),
    row('Direct Travel', 'DIRECT', 9932.55),
    row('Consultant Labor', 'DIRECT', 33138.98),
    row('Direct Materials', 'DIRECT', 194429.84),
    row('Subcontractor Labor', 'DIRECT', 1418128.17),
    row('Other Direct Cost', 'DIRECT', 243.14),
    row('Subcontractor Travel', 'DIRECT', 4926.44),
    row('Subcontractor Materials', 'DIRECT', 248785.22),
    // Same $1,418,128 Subcontractor figure re-stated in another pool — must NOT
    // double-count (dropped: not the DIRECT pool).
    row('Subcontractor Labor', 'DIRECT PROJECT', -4700000),
    row('Subcontractor Labor', 'UNCLASSIFIED', 1418128.17),
    // Indirect / junk that leaked into cost_detail under the cure — must drop.
    row('Payroll Labor', 'INDIRECT', 999999),
    row('Due From PD Systems', 'DIRECT', 123456),
    row('118-001', 'DIRECT', 5000),
  ];

  const out = aggregateDirectCostRows(rows);
  const byLine = new Map(out.map((r) => [r.cost_element, Number(r.actual_amount)]));

  it('produces exactly the eight canonical lines, each once', () => {
    expect(out).toHaveLength(8);
    const elements = out.map((r) => r.cost_element).sort();
    expect(elements).toEqual([...CANONICAL_DIRECT_COST_LINES].sort());
    expect(new Set(elements).size).toBe(8); // no cost_element double-counted
    for (const r of out) expect(r.pool).toBe('DIRECT');
  });

  it('folds Subcontractor Travel into the single Travel line', () => {
    expect(byLine.get('Dir Travel')).toBeCloseTo(9932.55 + 4926.44, 2);
  });

  it('does not double-count a figure re-stated across pools', () => {
    expect(byLine.get('Subcontractor')).toBeCloseTo(1418128.17, 2);
  });

  it('reconciles: the eight lines sum to Total Direct Costs (Jan = 2,373,157.37)', () => {
    const sum = out.reduce((a, r) => a + Number(r.actual_amount), 0);
    expect(sum).toBeCloseTo(2373157.37, 2);
  });
});

describe('ownedCostDetailMonths — one authoritative snapshot per period', () => {
  it('a quarter-end snapshot owns exactly its own quarter', () => {
    // MAR snapshot (Jan..Mar live) owns Q1; JUN snapshot (Jan..Jun live) owns Q2.
    expect([...ownedCostDetailMonths([1, 2, 3])].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect([...ownedCostDetailMonths([1, 2, 3, 4, 5, 6])].sort((a, b) => a - b)).toEqual([4, 5, 6]);
    expect([...ownedCostDetailMonths([7, 8, 9])].sort((a, b) => a - b)).toEqual([7, 8, 9]);
    expect([...ownedCostDetailMonths([10, 11, 12])].sort((a, b) => a - b)).toEqual([10, 11, 12]);
  });

  it('a non quarter-end snapshot owns no cost_detail (its quarter is owned by the closing snapshot)', () => {
    expect([...ownedCostDetailMonths([1])]).toEqual([]); // Jan-only upload
    expect([...ownedCostDetailMonths([1, 2])]).toEqual([]); // Feb-to-date
    expect([...ownedCostDetailMonths([1, 2, 3, 4])]).toEqual([]); // Apr-to-date
    expect([...ownedCostDetailMonths([])]).toEqual([]);
  });

  it('no month is owned by two overlapping snapshots (multi-source guard)', () => {
    // The exact FY26 failure: MAR and JUN Trended IS snapshots both restate
    // Jan/Feb/Mar. If both owned those months, the same figure would be counted
    // from two source docs. Ownership MUST be disjoint.
    const mar = ownedCostDetailMonths([1, 2, 3]);
    const jun = ownedCostDetailMonths([1, 2, 3, 4, 5, 6]);
    const overlap = [...mar].filter((m) => jun.has(m));
    expect(overlap).toEqual([]);
    // Together they cover Jan..Jun exactly once.
    const union = new Set([...mar, ...jun]);
    expect([...union].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
