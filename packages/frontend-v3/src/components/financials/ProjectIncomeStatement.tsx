"use client";

import { useState } from "react";
import { useProjectIncomeStatement } from "@/hooks/use-financial-bible";
import { NumberCell } from "@/components/financials/primitives/NumberCell";
import type {
  ProjectIncomeStatement as ProjectIncomeStatementValues,
  ProjectIncomeStatementColumn,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type RowKind = "summary" | "detail" | "section" | "separator";

interface StatementRow {
  kind: RowKind;
  label: string;
  key?: keyof ProjectIncomeStatementValues;
  format?: "money" | "percent";
  indent?: number;
}

/**
 * Full line structure of the per-project income statement, used when the
 * cost-pool book carries the direct/indirect itemization for the scope. Every
 * keyed line maps directly to a book column — no modeling or allocation. The
 * indirect pools are the book's own project-level pools (Overhead on/off-site,
 * Material Handling, G&A); the book carries no separate project Fringe line, so
 * none is shown (missing ≠ fabricated).
 */
const ROWS_DETAILED: StatementRow[] = [
  { kind: "section", label: "Revenue" },
  { kind: "summary", label: "Total Revenue", key: "revenue", format: "money" },

  { kind: "section", label: "Cost of Revenue (Direct)" },
  { kind: "detail", label: "Direct Labor — Onsite", key: "dc_dl_onsite", format: "money", indent: 1 },
  { kind: "detail", label: "Direct Labor — Offsite", key: "dc_dl_offsite", format: "money", indent: 1 },
  { kind: "detail", label: "Subcontractor Labor", key: "dc_subk_labor", format: "money", indent: 1 },
  { kind: "detail", label: "Subcontractor Travel", key: "dc_subk_travel", format: "money", indent: 1 },
  { kind: "detail", label: "Subcontractor Material", key: "dc_subk_material", format: "money", indent: 1 },
  { kind: "detail", label: "Consultant Labor", key: "dc_consultant_labor", format: "money", indent: 1 },
  { kind: "detail", label: "Consultant Travel", key: "dc_consultant_travel", format: "money", indent: 1 },
  { kind: "detail", label: "Direct Travel", key: "dc_direct_travel", format: "money", indent: 1 },
  { kind: "detail", label: "Direct Material", key: "dc_direct_material", format: "money", indent: 1 },
  { kind: "detail", label: "Other Direct Costs (ODC)", key: "dc_direct_odc", format: "money", indent: 1 },
  { kind: "summary", label: "Total Direct Costs", key: "direct_cost", format: "money" },

  { kind: "separator", label: "" },

  { kind: "summary", label: "Gross Profit", key: "gross_profit", format: "money" },
  { kind: "detail", label: "Gross Margin %", key: "gross_profit_pct", format: "percent", indent: 1 },

  { kind: "separator", label: "" },

  { kind: "section", label: "Indirect (Allocated Pools)" },
  { kind: "detail", label: "Overhead — Onsite", key: "ind_oh_onsite", format: "money", indent: 1 },
  { kind: "detail", label: "Overhead — Offsite", key: "ind_oh_offsite", format: "money", indent: 1 },
  { kind: "detail", label: "Material Handling (MHX)", key: "ind_mhx", format: "money", indent: 1 },
  { kind: "detail", label: "General & Administrative (G&A)", key: "ind_gna", format: "money", indent: 1 },
  { kind: "summary", label: "Total Indirect Costs", key: "indirect_cost", format: "money" },

  { kind: "separator", label: "" },

  { kind: "summary", label: "Total Cost (burdened)", key: "cost", format: "money" },
  { kind: "summary", label: "Operating Profit", key: "profit", format: "money" },
  { kind: "detail", label: "Operating Margin %", key: "margin_pct", format: "percent", indent: 1 },
];

/**
 * Burdened-summary layout, used when the cost-pool book carries only the
 * summary columns (revenue / cost / profit) for the scope — i.e. the project
 * was not ingested from the "Full Proj Revenue Summary by Cost Pool" workbook.
 * Every project row has these, so a complete, sourced statement still renders;
 * the direct/indirect itemization is simply omitted rather than shown as a wall
 * of "—".
 */
const ROWS_SUMMARY: StatementRow[] = [
  { kind: "section", label: "Revenue" },
  { kind: "summary", label: "Total Revenue", key: "revenue", format: "money" },

  { kind: "separator", label: "" },

  { kind: "summary", label: "Total Cost (burdened)", key: "cost", format: "money" },
  { kind: "summary", label: "Operating Profit", key: "profit", format: "money" },
  { kind: "detail", label: "Operating Margin %", key: "margin_pct", format: "percent", indent: 1 },
];

function cellValue(
  col: ProjectIncomeStatementValues,
  row: StatementRow,
): number | null {
  if (!row.key) return null;
  const v = col[row.key];
  return typeof v === "number" ? v : null;
}

export function ProjectIncomeStatement({
  projectFilter,
}: {
  projectFilter: string[];
}) {
  const [period, setPeriod] = useState("YTD");
  const { data, isLoading, error } = useProjectIncomeStatement(
    period,
    projectFilter,
    projectFilter.length > 0,
  );

  if (projectFilter.length === 0) return null;

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading project income statement…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-gda-red">
        Failed to load project income statement: {error.message}
      </div>
    );
  }

  const columns = data?.columns ?? [];
  const total = data?.total;
  const availablePeriods = data?.available_periods ?? ["YTD"];
  const showTotal = columns.length > 1 && total != null;

  // Render columns + optional total column.
  const displayColumns: Array<{
    label: string;
    sub: string | null;
    values: ProjectIncomeStatementValues;
    isTotal: boolean;
  }> = columns.map((c: ProjectIncomeStatementColumn) => ({
    label: c.project_name,
    sub: c.contract_number,
    values: c,
    isTotal: false,
  }));
  if (showTotal && total) {
    displayColumns.push({
      label: "Total (selected)",
      sub: `${columns.length} projects`,
      values: total,
      isTotal: true,
    });
  }

  // Show the itemized direct/indirect breakdown only when at least one shown
  // scope actually carries it in the cost-pool book; otherwise render the
  // burdened summary (which every project has) rather than a wall of "—".
  const anyDetail = displayColumns.some((c) => c.values.has_cost_pool_detail);
  const ROWS = anyDetail ? ROWS_DETAILED : ROWS_SUMMARY;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Project Income Statement
          </h3>
          <p className="text-[12px] text-muted-foreground">
            Sourced from the per-project book — no modeled allocation.{" "}
            {anyDetail
              ? "Direct/indirect line detail comes from the cost-pool workbook; lines the book didn't populate show \u201C\u2014\u201D."
              : "The selected project(s) carry only burdened summary figures in the book (revenue, cost, profit); the direct/indirect line detail isn't itemized for them."}{" "}
            The sum of project statements need not equal the company statement
            (company-level unallocated items exist).
          </p>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          Period
          <select
            className="rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {availablePeriods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      {columns.length === 0 ? (
        <div className="rounded border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          The selected project(s) have no cost-pool income-statement rows for
          this period.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-border max-h-[640px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-gda-bg-base text-[12px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pl-4 pr-4 text-left font-medium min-w-[220px]">
                  Line Item
                </th>
                {displayColumns.map((c, i) => (
                  <th
                    key={`${c.label}-${i}`}
                    className={cn(
                      "py-2 px-3 text-right font-medium whitespace-nowrap",
                      c.isTotal && "border-l-2 border-border text-foreground",
                    )}
                  >
                    <div>{c.label}</div>
                    {c.sub && (
                      <div className="font-normal normal-case text-muted-foreground/70">
                        {c.sub}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, idx) => {
                if (row.kind === "separator") {
                  return (
                    <tr key={`sep-${idx}`} className="h-2">
                      <td colSpan={1 + displayColumns.length} />
                    </tr>
                  );
                }
                if (row.kind === "section") {
                  return (
                    <tr key={`sec-${idx}`} className="bg-gda-bg-base">
                      <td
                        colSpan={1 + displayColumns.length}
                        className="py-2 pl-4 text-[12px] uppercase tracking-wider text-muted-foreground font-medium"
                      >
                        {row.label}
                      </td>
                    </tr>
                  );
                }
                const isSummary = row.kind === "summary";
                return (
                  <tr
                    key={`${row.label}-${idx}`}
                    className={cn(
                      "border-b border-border/50",
                      isSummary && "bg-card font-medium",
                    )}
                  >
                    <td
                      className={cn(
                        "py-2 pr-4 whitespace-nowrap",
                        row.indent ? "pl-8" : "pl-4",
                        isSummary
                          ? "text-foreground font-medium"
                          : "text-muted-foreground font-normal",
                      )}
                    >
                      {row.label}
                    </td>
                    {displayColumns.map((c, i) => (
                      <td
                        key={`${c.label}-${i}`}
                        className={cn(
                          "py-2 px-3 text-right",
                          c.isTotal && "border-l-2 border-border",
                        )}
                      >
                        <NumberCell value={cellValue(c.values, row)} format={row.format} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[12px] text-muted-foreground">
        Source: {data?.meta.source ?? "project_revenue_actuals"}
        {" · "}
        {data?.selected_period ?? period}
      </p>
    </div>
  );
}
