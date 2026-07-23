"use client";

import { useMemo } from "react";
import { useServiceCenters } from "@/hooks/use-financial-bible";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { FinSourceStrip } from "@/components/financials/FinSourceStrip";
import type { ServiceCenterRow } from "@/lib/types";

const MONTHS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const SC_SORT_COLS: ColumnSortConfig[] = [
  { field: "service_center_name", type: "string" },
  { field: "service_center_id", type: "string" },
  { field: "pool", type: "string" },
  { field: "org_id", type: "string" },
  { field: "ytd", type: "number" },
];

/** decimal fraction (0.349) → "34.9%"; null → em dash */
function fmtRate(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

export function ServiceCentersTab() {
  const { data, isLoading } = useServiceCenters();
  const { sortBy, sortDir, handleSort } = useTableSort("servicecenters");

  const centers = useMemo(() => data?.centers ?? [], [data]);

  const sortedCenters = useMemo(() => {
    // Default: highest YTD cost first, so the biggest service centers lead.
    if (!sortBy) return [...centers].sort((a, b) => b.ytd - a.ytd);
    return sortData(
      centers as unknown as Record<string, unknown>[],
      sortBy,
      sortDir,
      SC_SORT_COLS,
    ) as unknown as ServiceCenterRow[];
  }, [centers, sortBy, sortDir]);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-skeleton" />;
  }

  if (centers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Service-center cost data not yet ingested. Upload a{" "}
        <span className="font-medium">YTD GL Detail</span> workbook (its INDIRECT
        postings populate this view).
      </p>
    );
  }

  const months = data?.months ?? [];
  const pools = data?.pools ?? [];
  const rates = data?.rates ?? [];
  const fiscalYear = data?.fiscal_year ?? null;

  const totalYtd = centers.reduce((s, r) => s + r.ytd, 0);
  const monthRange =
    months.length > 0
      ? `${MONTHS[months[0]]}–${MONTHS[months[months.length - 1]]}`
      : "—";
  // The GL Detail is a fiscal-period ledger, so period is stated explicitly
  // (this view is fiscal-year native and does not switch to a calendar basis).
  const periodLabel =
    fiscalYear != null
      ? `FY${String(fiscalYear).slice(2)} · ${monthRange} (fiscal PD ${months[0]}–${months[months.length - 1]})`
      : monthRange;

  return (
    <div className="space-y-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Total Indirect Cost — YTD" value={formatMoney(totalYtd)} subtitle={periodLabel} />
        <Kpi label="Service Centers" value={String(centers.length)} subtitle="INDIRECT cost centers" />
        <Kpi label="Cost Pools" value={String(pools.length)} subtitle="PAG groups" />
        <Kpi label="Periods" value={monthRange} subtitle={fiscalYear != null ? `FY${String(fiscalYear).slice(2)}` : "—"} />
      </div>

      {/* Trend SIE pool-rate strip */}
      <div className="rounded border border-border bg-card p-4">
        <p className="mb-2 text-[12px] uppercase tracking-wider text-muted-foreground">
          Indirect Cost Pool Rates — Trend SIE (actual vs provisional)
        </p>
        {rates.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Pool rates not available — upload a Trend SIE workbook to populate.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {rates.map((r) => {
              const variance =
                r.ytd_actual != null && r.provisional != null
                  ? r.ytd_actual - r.provisional
                  : null;
              return (
                <div
                  key={r.pool_number}
                  className="min-w-[140px] flex-1 rounded border border-border px-3 py-2"
                >
                  <p className="text-[12px] font-medium text-foreground">{r.pool_name}</p>
                  <p className="text-[15px] font-semibold tabular-nums text-foreground">
                    {fmtRate(r.ytd_actual)}
                    <span className="ml-1 text-[12px] font-normal text-muted-foreground">YTD actual</span>
                  </p>
                  <p className="text-[12px] tabular-nums text-muted-foreground">
                    Prov {fmtRate(r.provisional)}
                    {variance != null && (
                      <span className="ml-1">
                        ({variance > 0 ? "+" : variance < 0 ? "\u2212" : ""}
                        {(Math.abs(variance) * 100).toFixed(1)} pts vs prov)
                      </span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pool subtotals */}
      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-[12px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Cost Pool (PAG)</th>
              {months.map((m) => (
                <th key={m} className="px-3 py-2 text-right font-medium">{MONTHS[m]}</th>
              ))}
              <th className="px-3 py-2 text-right font-medium">YTD</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((p) => (
              <tr key={p.pool} className="border-b border-border hover:bg-gda-panel/50">
                <td className="px-3 py-2 text-left font-medium text-foreground">{p.pool}</td>
                {months.map((m) => (
                  <td key={m} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {p.months[String(m)] != null ? formatMoney(p.months[String(m)]) : "—"}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                  {formatMoneyFull(p.ytd)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-gda-bg-base">
              <td className="px-3 py-2 text-left font-semibold text-foreground">Total INDIRECT</td>
              {months.map((m) => {
                const mt = pools.reduce((s, p) => s + (p.months[String(m)] ?? 0), 0);
                return (
                  <td key={m} className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                    {formatMoney(mt)}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                {formatMoneyFull(totalYtd)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Service-center detail — sortable */}
      <div className="rounded border border-border overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-gda-bg-base text-[12px] uppercase tracking-wider text-muted-foreground">
              <SortableHeader label="Service Center" field="service_center_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Code" field="service_center_id" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Pool" field="pool" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Org" field="org_id" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              {months.map((m) => (
                <th key={m} className="px-3 py-2 text-right font-medium">{MONTHS[m]}</th>
              ))}
              <SortableHeader label="YTD" field="ytd" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedCenters.map((r) => (
              <tr key={`${r.service_center_id}\u0000${r.pool ?? ""}`} className="border-b border-border hover:bg-gda-panel/50">
                <td className="px-3 py-2 text-left text-foreground">{r.service_center_name ?? "—"}</td>
                <td className="px-3 py-2 text-left text-muted-foreground">{r.service_center_id}</td>
                <td className="px-3 py-2 text-left text-muted-foreground">{r.pool ?? "—"}</td>
                <td className="px-3 py-2 text-left text-muted-foreground">{r.org_id ?? "—"}</td>
                {months.map((m) => (
                  <td key={m} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {r.months[String(m)] != null ? formatMoneyFull(r.months[String(m)]) : "—"}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">
                  {formatMoneyFull(r.ytd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FinSourceStrip
        table="service_center_actuals"
        rowCount={data?.meta.row_count ?? 0}
        period={periodLabel}
        note="INDIRECT postings from the YTD GL Detail ledger; pool rates from Trend SIE"
      />
    </div>
  );
}
