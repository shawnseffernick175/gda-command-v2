/**
 * The Revenue-by-Cost-Pool tab's job is to state the official book without
 * distorting it. These tests pin the two ways that could silently go wrong:
 * a pool the book never stated must read "—" (never $0), and the chart must
 * carry that gap through as null instead of plotting a zero.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { CostPoolFigures, CostPoolSummaryData } from "@/lib/types";

const useCostPoolSummary = vi.fn();
vi.mock("@/hooks/use-financial-bible", () => ({
  useCostPoolSummary: (...args: unknown[]) => useCostPoolSummary(...args),
}));

// The sortable table header reads the app router, which jsdom has no mount for.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/financials",
}));

// Capture the ECharts option instead of rendering a chart in jsdom.
const chartOptions: Record<string, unknown>[] = [];
vi.mock("@/lib/echarts-setup", () => ({
  echarts: {},
  ReactEChartsCore: (props: { option: Record<string, unknown> }) => {
    chartOptions.push(props.option);
    return null;
  },
}));

const { CostPoolTab } = await import("../CostPoolTab");

const DIRECT = [
  "dc_dl_offsite", "dc_dl_onsite", "dc_direct_travel",
  "dc_subk_labor", "dc_subk_travel", "dc_subk_material",
  "dc_consultant_labor", "dc_consultant_travel",
  "dc_direct_material", "dc_direct_odc",
] as const;
const INDIRECT = ["ind_oh_offsite", "ind_oh_onsite", "ind_mhx", "ind_gna"] as const;

function figures(overrides: Partial<CostPoolFigures> = {}): CostPoolFigures {
  const pools = Object.fromEntries(
    [...DIRECT, ...INDIRECT].map((f) => [f, null]),
  ) as Record<(typeof DIRECT)[number] | (typeof INDIRECT)[number], null>;
  return {
    revenue: null, direct_cost: null, gross_profit: null, indirect_cost: null,
    total_indirect_tgt: null, rate_variance: null, cost: null, profit: null,
    itd_revenue: null, contract_value: null, total_funded: null,
    margin_pct: null, gross_profit_pct: null, source_doc_ids: [],
    ...pools,
    ...overrides,
  };
}

function data(overrides: Partial<CostPoolSummaryData> = {}): CostPoolSummaryData {
  return {
    rows: [
      {
        ...figures({
          revenue: 310_853,
          direct_cost: 152_354,
          gross_profit: 158_499,
          indirect_cost: 126_775,
          profit: 31_724,
          margin_pct: 10.2,
          // Stated as a real zero by the book.
          dc_direct_travel: 0,
          // Never stated by the book.
          dc_subk_labor: null,
        }),
        project_id: "4510.002",
        project_name: "FOFC Option Yr 2",
        contract_number: "4510",
        division: "Envision",
        contract_label: "FOFC",
        prime_or_sub: "PRIME",
        proj_type: "CPFF",
        org_id: "1.01",
        pop_start: "2025-10-01",
        pop_end: "2026-09-30",
        is_active: true,
      },
    ],
    totals: figures({
      revenue: 310_853,
      direct_cost: 152_354,
      gross_profit: 158_499,
      gross_profit_pct: 51,
      indirect_cost: 126_775,
      total_indirect_tgt: 120_000,
      rate_variance: 6_775,
      profit: 31_724,
      margin_pct: 10.2,
      dc_direct_travel: 0,
      dc_subk_labor: null,
      source_doc_ids: [224],
    }),
    by_period: [
      { ...figures({ revenue: 100_000, direct_cost: 60_000, indirect_cost: 30_000 }), period: "FY26 Jan", month_num: 1 },
      // February: the book states no indirect for this scope.
      { ...figures({ revenue: 210_853, direct_cost: 92_354, indirect_cost: null }), period: "FY26 Feb", month_num: 2 },
    ],
    pools: { direct: [...DIRECT], indirect: [...INDIRECT] },
    filters: {
      contract_labels: ["FOFC", "RS3 - STEP"],
      prime_or_subs: ["PRIME", "CACI"],
      proj_types: ["CPFF", "T&M"],
      divisions: ["Envision"],
    },
    available_periods: ["YTD", "Q1", "FY26 Jan", "FY26 Feb"],
    available_months: ["FY26 Jan", "FY26 Feb"],
    available_quarters: ["Q1"],
    selected_period: "YTD",
    meta: {
      table: "project_revenue_actuals",
      row_count: 2,
      project_count: 1,
      source: "Revenue Summary by Cost Pool",
    },
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function render(payload: CostPoolSummaryData | undefined, isLoading = false) {
  useCostPoolSummary.mockReturnValue({ data: payload, isLoading });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(CostPoolTab, {}));
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  chartOptions.length = 0;
  useCostPoolSummary.mockReset();
});

describe("CostPoolTab", () => {
  it("shows the book's roll-ups and the source document", () => {
    render(data());
    const text = container.textContent ?? "";
    expect(text).toContain("$310,853");
    expect(text).toContain("$152,354");
    expect(text).toContain("$31,724");
    expect(text).toContain("10.2%");
    expect(text).toContain("project_revenue_actuals");
    expect(text).toContain("vault doc #224");
  });

  it("distinguishes a stated $0 from a value the book never stated", () => {
    render(data());
    const rowFor = (label: string) =>
      Array.from(container.querySelectorAll("div"))
        .find((d) => d.children.length === 2 && d.children[0].textContent === label);

    // Direct Travel is stated as zero — it must read $0, not "—".
    expect(rowFor("Direct Travel")?.children[1].textContent).toBe("$0");
    // Subcontract Labor was never stated — it must read "—", never $0.
    expect(rowFor("Subcontract Labor")?.children[1].textContent).toBe("—");
  });

  it("carries an unstated month through the chart as a gap, not a zero", () => {
    render(data());
    const trend = chartOptions[0] as {
      series: Array<{ name: string; data: Array<number | null> }>;
    };
    const indirect = trend.series.find((s) => s.name === "Total Indirect (Actual)");
    expect(indirect?.data).toEqual([30_000, null]);
  });

  it("keeps every trend series separately legendable", () => {
    render(data());
    const metricSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Metric"]',
    )!;
    // The stacked bars already show direct and indirect cost, so offering them
    // as the overlaid line would put two series under one legend entry.
    expect(Array.from(metricSelect.options).map((o) => o.value)).toEqual([
      "revenue",
      "gross_profit",
      "profit",
    ]);

    for (const value of ["gross_profit", "profit", "revenue"]) {
      act(() => {
        metricSelect.value = value;
        metricSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const trend = chartOptions.at(-1) as { series: Array<{ name: string }> };
      const names = trend.series.map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("offers only the filter values the book states", () => {
    render(data());
    const contractSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Contract"]',
    );
    expect(
      Array.from(contractSelect?.options ?? []).map((o) => o.value),
    ).toEqual(["", "FOFC", "RS3 - STEP"]);

    const typeSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Type"]',
    );
    expect(Array.from(typeSelect?.options ?? []).map((o) => o.value)).toEqual([
      "",
      "CPFF",
      "T&M",
    ]);
  });

  it("re-queries the API when a filter changes, so the chart and KPIs follow", () => {
    render(data());
    const contractSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Contract"]',
    )!;
    act(() => {
      contractSelect.value = "FOFC";
      contractSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const lastCall = useCostPoolSummary.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("YTD");
    expect(lastCall?.[2]).toMatchObject({ contract_label: "FOFC" });
  });

  it("says so plainly when the book has no rows for the selection", () => {
    render(data({ rows: [], totals: figures(), meta: { table: "project_revenue_actuals", row_count: 0, project_count: 0, source: "Revenue Summary by Cost Pool" } }));
    expect(container.textContent).toContain("No cost-pool rows");
    // No fabricated zeros in place of the missing book.
    expect(container.textContent).not.toContain("$0");
  });
});
