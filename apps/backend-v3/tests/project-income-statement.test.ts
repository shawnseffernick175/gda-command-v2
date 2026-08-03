import { describe, it, expect } from 'vitest';
import {
  aggregateProjectIncomeStatement,
  buildProjectColumns,
  projectIdentity,
  type ProjectCostPoolRow,
} from '../src/lib/project-income-statement.js';

function row(overrides: Partial<ProjectCostPoolRow>): ProjectCostPoolRow {
  return {
    project_id: null,
    project_name: 'X',
    contract_number: null,
    revenue: null,
    direct_cost: null,
    indirect_cost: null,
    profit: null,
    gross_profit: null,
    dc_dl_onsite: null,
    dc_dl_offsite: null,
    dc_subk_labor: null,
    dc_subk_travel: null,
    dc_subk_material: null,
    dc_consultant_labor: null,
    dc_consultant_travel: null,
    dc_direct_travel: null,
    dc_direct_material: null,
    dc_direct_odc: null,
    ind_oh_onsite: null,
    ind_oh_offsite: null,
    ind_mhx: null,
    ind_gna: null,
    source_doc_id: null,
    ...overrides,
  };
}

describe('aggregateProjectIncomeStatement', () => {
  it('sums dollar lines across rows (months)', () => {
    const s = aggregateProjectIncomeStatement([
      row({ revenue: 100, direct_cost: 60, gross_profit: 40, dc_dl_onsite: 30 }),
      row({ revenue: 50, direct_cost: 20, gross_profit: 30, dc_dl_onsite: 10 }),
    ]);
    expect(s.revenue).toBe(150);
    expect(s.direct_cost).toBe(80);
    expect(s.gross_profit).toBe(70);
    expect(s.dc_dl_onsite).toBe(40);
  });

  it('re-derives margin and gross-profit % from summed dollars (never averages)', () => {
    const s = aggregateProjectIncomeStatement([
      row({ revenue: 100, profit: 10, gross_profit: 40 }),
      row({ revenue: 300, profit: 90, gross_profit: 60 }),
    ]);
    // profit 100 / revenue 400 = 25% (not the average of 10% and 30%)
    expect(s.margin_pct).toBe(25);
    // gross 100 / revenue 400 = 25%
    expect(s.gross_profit_pct).toBe(25);
  });

  it('keeps a line null when no row carried it (missing ≠ zero)', () => {
    const s = aggregateProjectIncomeStatement([
      row({ revenue: 100, direct_cost: 60 }),
    ]);
    expect(s.ind_mhx).toBeNull();
    expect(s.ind_gna).toBeNull();
    expect(s.dc_subk_labor).toBeNull();
  });

  it('treats a genuine zero as a value, distinct from null', () => {
    const s = aggregateProjectIncomeStatement([
      row({ revenue: 100, ind_gna: 0 }),
    ]);
    expect(s.ind_gna).toBe(0);
  });

  it('returns null margins when revenue is zero (no divide-by-zero)', () => {
    const s = aggregateProjectIncomeStatement([
      row({ revenue: 0, profit: 5, gross_profit: 5 }),
    ]);
    expect(s.margin_pct).toBeNull();
    expect(s.gross_profit_pct).toBeNull();
  });

  it('collects distinct, sorted source_doc_ids for R1 traceability', () => {
    const s = aggregateProjectIncomeStatement([
      row({ revenue: 1, source_doc_id: 7 }),
      row({ revenue: 1, source_doc_id: 3 }),
      row({ revenue: 1, source_doc_id: 7 }),
    ]);
    expect(s.source_doc_ids).toEqual([3, 7]);
  });
});

describe('projectIdentity', () => {
  it('prefers project_id, then contract_number, then project_name', () => {
    expect(projectIdentity({ project_id: '1010.003', contract_number: 'C1', project_name: 'STEP' })).toBe('1010.003');
    expect(projectIdentity({ project_id: null, contract_number: 'C1', project_name: 'STEP' })).toBe('C1');
    expect(projectIdentity({ project_id: null, contract_number: null, project_name: 'STEP' })).toBe('STEP');
  });
});

describe('buildProjectColumns', () => {
  it('groups rows by project identity and orders by revenue desc', () => {
    const cols = buildProjectColumns([
      row({ project_id: 'A', project_name: 'Alpha', revenue: 100, profit: 10 }),
      row({ project_id: 'A', project_name: 'Alpha', revenue: 100, profit: 10 }),
      row({ project_id: 'B', project_name: 'Bravo', revenue: 500, profit: 50 }),
    ]);
    expect(cols).toHaveLength(2);
    expect(cols[0].project_id).toBe('B'); // higher revenue first
    expect(cols[0].revenue).toBe(500);
    expect(cols[1].project_id).toBe('A');
    expect(cols[1].revenue).toBe(200); // two months summed
    expect(cols[1].margin_pct).toBe(10); // 20 / 200
  });

  it('takes identity from a revenue-bearing row when the first is empty', () => {
    const cols = buildProjectColumns([
      row({ project_id: 'A', project_name: '', revenue: 0 }),
      row({ project_id: 'A', project_name: 'Alpha', revenue: 100 }),
    ]);
    expect(cols).toHaveLength(1);
    expect(cols[0].project_name).toBe('Alpha');
    expect(cols[0].revenue).toBe(100);
  });
});
