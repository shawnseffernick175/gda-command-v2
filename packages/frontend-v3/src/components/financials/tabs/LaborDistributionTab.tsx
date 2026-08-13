"use client";

import { useMemo } from "react";
import { useLaborDistribution } from "@/hooks/use-financial-bible";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { FinSourceStrip } from "@/components/financials/FinSourceStrip";
import {
  PeriodScopeSelector,
  usePeriodScope,
  periodOptionsFrom,
  quarterOfPeriod,
} from "@/components/financials/primitives/PeriodScope";
import type { LaborCategoryRow } from "@/lib/types";

const MONTHS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const KIND_LABEL: Record<LaborCategoryRow["kind"], string> = {
  direct: "Direct labor",
  indirect: "Indirect labor",
  leave: "Leave taken",
  other: "Other",
};

/**
 * Labor Distribution — payroll's monthly Wages book, per employee, split across
 * the cost pools the hours were charged to. This is the labor base under every
 * indirect rate, so the tab leads with the direct/indirect split and the pool
 * mix, then drops to the employee roster behind those totals.
 *
 * Every figure is a sum of ingested employee rows (the workbook's own
 * "Overall - Total" footer is never stored), and the source strip names the
 * table and the books it came from (R1).
 */
export function LaborDistributionTab() {
  const { data, isLoading } = useLaborDistribution();
  const { sortBy, sortDir, handleSort } = useTableSort("labordistribution");
  const scope = usePeriodScope();

  const categories = useMemo(() => data?.categories ?? [], [data]);
  const employees = useMemo(() => data?.employees ?? [], [data]);

  const allMonths = useMemo(() => data?.months ?? [], [data]);
  const fiscalYear = data?.fiscal_year ?? null;
  const fyPrefix = fiscalYear != null ? `FY${String(fiscalYear).slice(2)} ` : "";
  // Payroll states fiscal period numbers; the shared control speaks in
  // "FY26 Jul" periods, so translate rather than showing a second vocabulary.
  const monthPeriodOf = (m: number) => `${fyPrefix}${MONTHS[m]}`;
  const { months: monthOptions, quarters: quarterOptions } = useMemo(
    () => periodOptionsFrom(allMonths.map((m) => `${fyPrefix}${MONTHS[m]}`)),
    [allMonths, fyPrefix],
  );
  const months = useMemo(
    () =>
      allMonths.filter((m) => {
        if (scope.period === "YTD") return true;
        if (/^Q[1-4]$/.test(scope.period)) {
          return quarterOfPeriod(monthPeriodOf(m)) === scope.period;
        }
        return monthPeriodOf(m) === scope.period;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allMonths, scope.period, fyPrefix],
  );
  const monthSet = useMemo(() => months.map(String), [months]);
  /** Row total over the scoped months only (YTD when nothing is narrowed). */
  const scopedTotal = (byMonth: Record<string, number>, ytd: number) =>
    scope.period === "YTD"
      ? ytd
      : monthSet.reduce((s, k) => s + (byMonth[k] ?? 0), 0);

  // Employee rows folded down to the scoped months, so the pool columns cover
  // exactly the same periods as the total column.
  const scopedEmployees = useMemo(
    () =>
      employees.map((e) => {
        const monthKeys =
          scope.period === "YTD" ? Object.keys(e.by_category_month) : monthSet;
        const by_category: Record<string, number> = {};
        for (const key of monthKeys) {
          const perPool = e.by_category_month[key];
          if (!perPool) continue;
          for (const [cat, v] of Object.entries(perPool)) {
            by_category[cat] = (by_category[cat] ?? 0) + v;
          }
        }
        return { row: e, by_category, total: scopedTotal(e.months, e.ytd) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, scope.period, monthSet],
  );

  const sortedEmployees = useMemo(() => {
    // Default: highest scoped wages first, so the biggest charges lead.
    if (!sortBy) return [...scopedEmployees].sort((a, b) => b.total - a.total);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...scopedEmployees].sort((a, b) => {
      if (sortBy === "ytd") return dir * (a.total - b.total);
      if (sortBy === "employee_name") {
        return dir * (a.row.employee_name ?? "").localeCompare(b.row.employee_name ?? "");
      }
      if (sortBy === "employee_id") return dir * a.row.employee_id.localeCompare(b.row.employee_id);
      // Any remaining sortable column is a wage pool.
      return dir * ((a.by_category[sortBy] ?? 0) - (b.by_category[sortBy] ?? 0));
    });
  }, [scopedEmployees, sortBy, sortDir]);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-skeleton" />;
  }

  if (employees.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Wage distribution not yet ingested. Upload a{" "}
        <span className="font-medium">monthly Wages workbook</span> (e.g.
        &ldquo;JUL-26 Wages.xlsx&rdquo;) — its per-employee rows populate this view.
      </p>
    );
  }

  const scopedLabel = scope.period === "YTD" ? "YTD" : scope.label;
  const catTotal = (c: LaborCategoryRow) => scopedTotal(c.months, c.ytd);
  const kindTotal = (kind: LaborCategoryRow["kind"]) =>
    categories.filter((c) => c.kind === kind).reduce((s, c) => s + catTotal(c), 0);

  const direct = kindTotal("direct");
  const indirect = kindTotal("indirect");
  const leave = kindTotal("leave");
  const ucot = categories.filter((c) => c.key === "ucot").reduce((s, c) => s + catTotal(c), 0);
  const unallow = categories
    .filter((c) => c.key === "unallow_unbill")
    .reduce((s, c) => s + catTotal(c), 0);
  // The pool columns sum to Total Wages by construction of the book, so the
  // total is the sum of what is displayed — never a separately-sourced figure.
  const total = categories.reduce((s, c) => s + catTotal(c), 0);
  const directPct = total !== 0 ? (direct / total) * 100 : null;

  const monthRange =
    months.length > 0
      ? `${MONTHS[months[0]]}–${MONTHS[months[months.length - 1]]}`
      : "—";
  const periodLabel =
    fiscalYear != null && months.length > 0
      ? `FY${String(fiscalYear).slice(2)} · ${monthRange} (fiscal PD ${months[0]}–${months[months.length - 1]})`
      : monthRange;

  const employeeCount = scopedEmployees.filter((e) => e.total !== 0).length;

  return (
    <div className="space-y-6">
      <PeriodScopeSelector
        scope={scope}
        monthOptions={monthOptions}
        quarterOptions={quarterOptions}
        right={
          <p className="text-sm font-medium text-foreground">
            {periodLabel} — {formatMoneyFull(total)} wages
          </p>
        }
      />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label={`Total Wages — ${scopedLabel}`} value={formatMoney(total)} subtitle={periodLabel} />
        <Kpi
          label="Direct Labor"
          value={formatMoney(direct)}
          subtitle={directPct != null ? `${directPct.toFixed(1)}% of wages` : "—"}
        />
        <Kpi label="Indirect Labor" value={formatMoney(indirect)} subtitle="Fringe + OH + MHx + G&A" />
        <Kpi label="Employees Paid" value={String(employeeCount)} subtitle={`of ${employees.length} on the book`} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Leave Taken (V-H-P-S)" value={formatMoney(leave)} subtitle="Vacation / holiday / personal / sick" />
        <Kpi label="UCOT" value={formatMoney(ucot)} subtitle="Uncompensated overtime credit" />
        <Kpi label="Unallowable / Unbillable" value={formatMoney(unallow)} subtitle="Not recoverable" />
        <Kpi label="Periods" value={monthRange} subtitle={fiscalYear != null ? `FY${String(fiscalYear).slice(2)}` : "—"} />
      </div>

      {months.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          No payroll periods stated for {scopedLabel}.
        </p>
      )}

      {/* Pool mix — one row per wage column of the source book */}
      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-[12px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Wage Pool</th>
              <th className="px-3 py-2 text-left font-medium">Group</th>
              {months.map((m) => (
                <th key={m} className="px-3 py-2 text-right font-medium">{MONTHS[m]}</th>
              ))}
              <th className="px-3 py-2 text-right font-medium">{scopedLabel}</th>
              <th className="px-3 py-2 text-right font-medium">% of wages</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => {
              const ct = catTotal(c);
              return (
                <tr key={c.key} className="border-b border-border hover:bg-gda-panel/50">
                  <td className="px-3 py-2 text-left font-medium text-foreground">{c.label}</td>
                  <td className="px-3 py-2 text-left text-muted-foreground">{KIND_LABEL[c.kind]}</td>
                  {months.map((m) => (
                    <td key={m} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {c.months[String(m)] != null ? formatMoney(c.months[String(m)]) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                    {formatMoneyFull(ct)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {total !== 0 ? `${((ct / total) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-border bg-gda-bg-base">
              <td className="px-3 py-2 text-left font-semibold text-foreground">Total Wages</td>
              <td className="px-3 py-2" />
              {months.map((m) => {
                const mt = categories.reduce((s, c) => s + (c.months[String(m)] ?? 0), 0);
                return (
                  <td key={m} className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                    {formatMoney(mt)}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                {formatMoneyFull(total)}
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">100.0%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Employee detail — sortable, one row per employee with their pool split */}
      <div className="rounded border border-border overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-gda-bg-base text-[12px] uppercase tracking-wider text-muted-foreground">
              <SortableHeader label="Employee" field="employee_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="ID" field="employee_id" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              {categories.map((c) => (
                <SortableHeader
                  key={c.key}
                  label={c.label}
                  field={c.key}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
              ))}
              <SortableHeader label={scopedLabel} field="ytd" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedEmployees.map(({ row, by_category, total: empTotal }) => (
              <tr key={row.employee_id} className="border-b border-border hover:bg-gda-panel/50">
                <td className="px-3 py-2 text-left text-foreground">{row.employee_name ?? "—"}</td>
                <td className="px-3 py-2 text-left text-muted-foreground">{row.employee_id}</td>
                {categories.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {by_category[c.key] ? formatMoneyFull(by_category[c.key]) : "—"}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">
                  {formatMoneyFull(empTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FinSourceStrip
        table="wage_distribution_actuals"
        rowCount={data?.meta.row_count ?? 0}
        period={periodLabel}
        note={
          data && data.meta.sources.length > 0
            ? `per-employee rows from ${data.meta.sources.map((s) => s.filename).join(", ")}`
            : "per-employee rows from payroll’s monthly Wages workbook"
        }
      />
    </div>
  );
}
