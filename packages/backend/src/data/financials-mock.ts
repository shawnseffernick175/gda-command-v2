/**
 * Mock financial data for the Financial KPI Strip and Financial Bible.
 *
 * KPIs: Orders, Sales, EBIT, ROS, Funded Backlog, Backlog, Gross Profit
 * Each KPI has a current value, prior period, plan/target, and constituent records.
 */

export interface FinancialKPI {
  key: string;
  label: string;
  current: number;
  prior: number;
  plan: number;
  unit: "currency" | "percent" | "ratio";
  period: string;
  updated_at: string;
}

export interface FinancialLineItem {
  id: string;
  kpi_key: string;
  label: string;
  amount: number;
  category: string;
  contract_id: string | null;
  period: string;
  notes: string | null;
}

export interface FinancialTrend {
  period: string;
  value: number;
}

export interface FinancialDrillDown {
  kpi: FinancialKPI;
  line_items: FinancialLineItem[];
  trends: FinancialTrend[];
  variance_from_plan: number;
  variance_pct: number;
  insights: string[];
}

const CURRENT_PERIOD = "FY25-Q2";
const PRIOR_PERIOD = "FY25-Q1";
const UPDATED_AT = new Date().toISOString();

export const MOCK_FINANCIAL_KPIS: FinancialKPI[] = [
  {
    key: "orders",
    label: "Orders",
    current: 42_500_000,
    prior: 38_200_000,
    plan: 45_000_000,
    unit: "currency",
    period: CURRENT_PERIOD,
    updated_at: UPDATED_AT,
  },
  {
    key: "sales",
    label: "Sales",
    current: 31_800_000,
    prior: 29_500_000,
    plan: 33_000_000,
    unit: "currency",
    period: CURRENT_PERIOD,
    updated_at: UPDATED_AT,
  },
  {
    key: "ebit",
    label: "EBIT",
    current: 4_770_000,
    prior: 4_130_000,
    plan: 4_950_000,
    unit: "currency",
    period: CURRENT_PERIOD,
    updated_at: UPDATED_AT,
  },
  {
    key: "ros",
    label: "ROS",
    current: 0.15,
    prior: 0.14,
    plan: 0.15,
    unit: "percent",
    period: CURRENT_PERIOD,
    updated_at: UPDATED_AT,
  },
  {
    key: "funded_backlog",
    label: "Funded Backlog",
    current: 68_400_000,
    prior: 72_100_000,
    plan: 70_000_000,
    unit: "currency",
    period: CURRENT_PERIOD,
    updated_at: UPDATED_AT,
  },
  {
    key: "backlog",
    label: "Backlog",
    current: 124_600_000,
    prior: 118_300_000,
    plan: 130_000_000,
    unit: "currency",
    period: CURRENT_PERIOD,
    updated_at: UPDATED_AT,
  },
  {
    key: "gross_profit",
    label: "Gross Profit",
    current: 9_540_000,
    prior: 8_555_000,
    plan: 9_900_000,
    unit: "currency",
    period: CURRENT_PERIOD,
    updated_at: UPDATED_AT,
  },
];

export const MOCK_FINANCIAL_LINE_ITEMS: FinancialLineItem[] = [
  // Orders
  { id: "fin-001", kpi_key: "orders", label: "USACE FUDS IDIQ Task Order 3", amount: 12_400_000, category: "Task Order", contract_id: "W912DY-22-D-0042", period: CURRENT_PERIOD, notes: "Environmental remediation — Fort Ord" },
  { id: "fin-002", kpi_key: "orders", label: "EPA Superfund RI/FS", amount: 8_500_000, category: "New Award", contract_id: "68HE0523F0041", period: CURRENT_PERIOD, notes: "Remedial investigation at Portland Harbor" },
  { id: "fin-003", kpi_key: "orders", label: "Air Force Tyndall MILCON", amount: 14_200_000, category: "Modification", contract_id: "FA4819-23-C-0008", period: CURRENT_PERIOD, notes: "Hurricane recovery infrastructure rebuild" },
  { id: "fin-004", kpi_key: "orders", label: "DOE Oak Ridge D&D", amount: 5_200_000, category: "Option Exercise", contract_id: "DE-EM0005106", period: CURRENT_PERIOD, notes: "Decontamination & decommissioning — K-25" },
  { id: "fin-005", kpi_key: "orders", label: "NASA KSC Environmental", amount: 2_200_000, category: "Task Order", contract_id: "80KSC023CA006", period: CURRENT_PERIOD, notes: "Launch pad environmental compliance" },

  // Sales
  { id: "fin-006", kpi_key: "sales", label: "USACE FUDS — Fort Ord Execution", amount: 9_800_000, category: "Contract Revenue", contract_id: "W912DY-22-D-0042", period: CURRENT_PERIOD, notes: "Revenue recognized on milestone deliverables" },
  { id: "fin-007", kpi_key: "sales", label: "EPA Superfund — Portland Harbor", amount: 6_200_000, category: "Contract Revenue", contract_id: "68HE0523F0041", period: CURRENT_PERIOD, notes: "Phase 1 field investigation complete" },
  { id: "fin-008", kpi_key: "sales", label: "Air Force Tyndall — Design Phase", amount: 8_400_000, category: "Contract Revenue", contract_id: "FA4819-23-C-0008", period: CURRENT_PERIOD, notes: "65% design review approved" },
  { id: "fin-009", kpi_key: "sales", label: "DOE Oak Ridge — Demolition", amount: 4_600_000, category: "Contract Revenue", contract_id: "DE-EM0005106", period: CURRENT_PERIOD, notes: "Building 9204-4 demolition on schedule" },
  { id: "fin-010", kpi_key: "sales", label: "Navy NAVFAC — Guam Relocation", amount: 2_800_000, category: "Contract Revenue", contract_id: "N62742-23-D-1234", period: CURRENT_PERIOD, notes: "Site preparation phase" },

  // EBIT
  { id: "fin-011", kpi_key: "ebit", label: "USACE FUDS Program", amount: 1_470_000, category: "Program Margin", contract_id: "W912DY-22-D-0042", period: CURRENT_PERIOD, notes: "15% margin on $9.8M revenue" },
  { id: "fin-012", kpi_key: "ebit", label: "EPA Superfund Program", amount: 930_000, category: "Program Margin", contract_id: "68HE0523F0041", period: CURRENT_PERIOD, notes: "15% margin on $6.2M revenue" },
  { id: "fin-013", kpi_key: "ebit", label: "Air Force Tyndall Program", amount: 1_260_000, category: "Program Margin", contract_id: "FA4819-23-C-0008", period: CURRENT_PERIOD, notes: "15% margin on $8.4M revenue" },
  { id: "fin-014", kpi_key: "ebit", label: "DOE Oak Ridge Program", amount: 690_000, category: "Program Margin", contract_id: "DE-EM0005106", period: CURRENT_PERIOD, notes: "15% margin on $4.6M revenue" },
  { id: "fin-015", kpi_key: "ebit", label: "G&A / Overhead Absorption", amount: 420_000, category: "Overhead", contract_id: null, period: CURRENT_PERIOD, notes: "Favorable overhead rate variance" },

  // Funded Backlog
  { id: "fin-016", kpi_key: "funded_backlog", label: "USACE FUDS — Remaining Funded", amount: 22_600_000, category: "Funded CLINs", contract_id: "W912DY-22-D-0042", period: CURRENT_PERIOD, notes: "Task orders 1-3 remaining funded value" },
  { id: "fin-017", kpi_key: "funded_backlog", label: "Air Force Tyndall — Remaining", amount: 19_800_000, category: "Funded CLINs", contract_id: "FA4819-23-C-0008", period: CURRENT_PERIOD, notes: "Construction phase funding obligated" },
  { id: "fin-018", kpi_key: "funded_backlog", label: "EPA Superfund — Remaining", amount: 12_400_000, category: "Funded CLINs", contract_id: "68HE0523F0041", period: CURRENT_PERIOD, notes: "Phase 2 feasibility study funded" },
  { id: "fin-019", kpi_key: "funded_backlog", label: "DOE Oak Ridge — Remaining", amount: 8_200_000, category: "Funded CLINs", contract_id: "DE-EM0005106", period: CURRENT_PERIOD, notes: "Option year 2 exercised and funded" },
  { id: "fin-020", kpi_key: "funded_backlog", label: "Other Active Contracts", amount: 5_400_000, category: "Funded CLINs", contract_id: null, period: CURRENT_PERIOD, notes: "Smaller task orders and support contracts" },

  // Backlog (total = funded + unfunded)
  { id: "fin-021", kpi_key: "backlog", label: "USACE FUDS — Total Remaining", amount: 45_200_000, category: "Total Contract Value", contract_id: "W912DY-22-D-0042", period: CURRENT_PERIOD, notes: "Includes unfunded option years 3-5" },
  { id: "fin-022", kpi_key: "backlog", label: "Air Force Tyndall — Total", amount: 33_600_000, category: "Total Contract Value", contract_id: "FA4819-23-C-0008", period: CURRENT_PERIOD, notes: "Includes construction + commissioning phases" },
  { id: "fin-023", kpi_key: "backlog", label: "EPA Superfund — Total", amount: 18_500_000, category: "Total Contract Value", contract_id: "68HE0523F0041", period: CURRENT_PERIOD, notes: "Includes unfunded remedial design phase" },
  { id: "fin-024", kpi_key: "backlog", label: "DOE Oak Ridge — Total", amount: 15_200_000, category: "Total Contract Value", contract_id: "DE-EM0005106", period: CURRENT_PERIOD, notes: "Includes option years 3-4" },
  { id: "fin-025", kpi_key: "backlog", label: "Other Contracts — Total", amount: 12_100_000, category: "Total Contract Value", contract_id: null, period: CURRENT_PERIOD, notes: "Navy NAVFAC, NASA KSC, smaller contracts" },

  // Gross Profit
  { id: "fin-026", kpi_key: "gross_profit", label: "USACE FUDS — Gross Margin", amount: 2_940_000, category: "Direct Margin", contract_id: "W912DY-22-D-0042", period: CURRENT_PERIOD, notes: "30% gross margin on $9.8M revenue" },
  { id: "fin-027", kpi_key: "gross_profit", label: "Air Force Tyndall — Gross Margin", amount: 2_520_000, category: "Direct Margin", contract_id: "FA4819-23-C-0008", period: CURRENT_PERIOD, notes: "30% gross margin on $8.4M revenue" },
  { id: "fin-028", kpi_key: "gross_profit", label: "EPA Superfund — Gross Margin", amount: 1_860_000, category: "Direct Margin", contract_id: "68HE0523F0041", period: CURRENT_PERIOD, notes: "30% gross margin on $6.2M revenue" },
  { id: "fin-029", kpi_key: "gross_profit", label: "DOE Oak Ridge — Gross Margin", amount: 1_380_000, category: "Direct Margin", contract_id: "DE-EM0005106", period: CURRENT_PERIOD, notes: "30% gross margin on $4.6M revenue" },
  { id: "fin-030", kpi_key: "gross_profit", label: "Other Programs — Gross Margin", amount: 840_000, category: "Direct Margin", contract_id: null, period: CURRENT_PERIOD, notes: "Combined smaller programs" },
];

function buildTrends(key: string, current: number): FinancialTrend[] {
  const variance = key === "ros" ? 0.01 : current * 0.08;
  return [
    { period: "FY24-Q1", value: current * 0.82 + (Math.random() - 0.5) * variance },
    { period: "FY24-Q2", value: current * 0.85 + (Math.random() - 0.5) * variance },
    { period: "FY24-Q3", value: current * 0.89 + (Math.random() - 0.5) * variance },
    { period: "FY24-Q4", value: current * 0.93 + (Math.random() - 0.5) * variance },
    { period: "FY25-Q1", value: current * 0.96 + (Math.random() - 0.5) * variance },
    { period: CURRENT_PERIOD, value: current },
  ];
}

export function getMockFinancialKPIs(): FinancialKPI[] {
  return MOCK_FINANCIAL_KPIS;
}

export function getMockFinancialDrillDown(key: string): FinancialDrillDown | null {
  const kpi = MOCK_FINANCIAL_KPIS.find((k) => k.key === key);
  if (!kpi) return null;

  const lineItems = MOCK_FINANCIAL_LINE_ITEMS.filter((li) => li.kpi_key === key);
  const trends = buildTrends(key, kpi.current);
  const variance = kpi.current - kpi.plan;
  const variancePct = kpi.plan !== 0 ? (variance / kpi.plan) * 100 : 0;

  const insights: string[] = [];
  if (variancePct < -5) {
    insights.push(`${kpi.label} is ${Math.abs(variancePct).toFixed(1)}% below plan — review pipeline coverage.`);
  } else if (variancePct > 5) {
    insights.push(`${kpi.label} is ${variancePct.toFixed(1)}% above plan — strong performance.`);
  } else {
    insights.push(`${kpi.label} is tracking within 5% of plan.`);
  }

  const changeFromPrior = kpi.current - kpi.prior;
  const changePct = kpi.prior !== 0 ? (changeFromPrior / kpi.prior) * 100 : 0;
  if (changePct > 0) {
    insights.push(`Up ${changePct.toFixed(1)}% from ${PRIOR_PERIOD}.`);
  } else if (changePct < 0) {
    insights.push(`Down ${Math.abs(changePct).toFixed(1)}% from ${PRIOR_PERIOD}.`);
  }

  if (key === "funded_backlog" && kpi.current < kpi.prior) {
    insights.push("Funded backlog drawdown — new orders needed to replenish.");
  }

  return {
    kpi,
    line_items: lineItems,
    trends,
    variance_from_plan: variance,
    variance_pct: variancePct,
    insights,
  };
}
