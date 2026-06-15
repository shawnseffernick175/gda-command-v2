"use client";

import { useState } from "react";
import { useOverrideSummary } from "@/hooks/use-overrides";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import Link from "next/link";

type Range = "7d" | "30d" | "all";

const RANGES: { label: string; value: Range }[] = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "All time", value: "all" },
];

const STAGES = [
  "interest",
  "qualify",
  "pursue",
  "solicitation",
  "post_submittal",
  "won",
  "lost",
  "no_bid",
  "gov_cancelled",
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function emDash(val: number): string {
  return val === 0 ? "\u2014" : String(val);
}

export default function OverridesPage() {
  const [range, setRange] = useState<Range>("30d");
  const { data, isLoading } = useOverrideSummary(range);

  const mostCommonDisagreement = data?.stage_pivot?.[0]
    ? `${data.stage_pivot[0].ai_value}\u2192${data.stage_pivot[0].human_value}: ${data.stage_pivot[0].count} times`
    : "\u2014";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 sticky-page-header">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-lg font-bold text-foreground">
            Override Audit
          </h1>
          <div className="flex gap-2">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium transition-colors",
                  range === r.value
                    ? "bg-gda-green text-white"
                    : "border border-border bg-white text-muted-foreground hover:bg-gda-bg-base",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* KPI Strip */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Total Overrides
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold tabular-nums">
                  {emDash(
                    range === "7d"
                      ? data.totals.last_7d
                      : range === "30d"
                        ? data.totals.last_30d
                        : data.totals.all_time,
                  )}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Stage Agreement Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold tabular-nums">
                  {data.agreement_rate.stage_pct === 0
                    ? "\u2014"
                    : `${data.agreement_rate.stage_pct}%`}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Most Common Disagreement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-lg font-bold">{mostCommonDisagreement}</span>
              </CardContent>
            </Card>
          </div>

          {/* Stage Pivot Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Stage Override Matrix
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Rows = Previous stage, Columns = Human override
              </p>
            </CardHeader>
            <CardContent>
              <PivotTable
                rowLabels={STAGES}
                colLabels={STAGES}
                data={data.stage_pivot}
              />
            </CardContent>
          </Card>


          {/* Recent Overrides Feed */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Recent Overrides
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No overrides recorded yet. Overrides appear here when you
                  change an opportunity{"\u2019"}s pipeline stage from
                  the system-suggested value.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 pr-4">Date</th>
                        <th className="pb-2 pr-4">Opportunity</th>
                        <th className="pb-2 pr-4">Field</th>
                        <th className="pb-2 pr-4">Override</th>
                        <th className="pb-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-border last:border-0"
                        >
                          <td className="py-2 pr-4 tabular-nums">
                            {formatDate(row.created_at)}
                          </td>
                          <td className="py-2 pr-4">
                            <Link
                              href={`/opportunities/${row.opportunity_id}`}
                              className="text-gda-green hover:underline"
                            >
                              {row.opportunity_title}
                            </Link>
                          </td>
                          <td className="py-2 pr-4 capitalize">
                            {row.field_name === "pipeline_stage"
                              ? "Stage"
                              : row.field_name}
                          </td>
                          <td className="py-2 pr-4 font-medium">
                            AI: {row.ai_value ?? "none"} → You:{" "}
                            {row.human_value}
                          </td>
                          <td className="max-w-[200px] truncate py-2 text-muted-foreground">
                            {row.reason || "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function PivotTable({
  rowLabels,
  colLabels,
  data,
}: {
  rowLabels: string[];
  colLabels: string[];
  data: { ai_value: string; human_value: string; count: number }[];
}) {
  const lookup = new Map<string, number>();
  let maxCount = 0;
  for (const row of data) {
    const key = `${row.ai_value}|${row.human_value}`;
    lookup.set(key, row.count);
    if (row.count > maxCount) maxCount = row.count;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="pb-1 pr-2 text-left uppercase tracking-wider text-muted-foreground">
              AI \ Human
            </th>
            {colLabels.map((col) => (
              <th
                key={col}
                className="pb-1 text-center uppercase tracking-wider text-muted-foreground"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((row) => (
            <tr key={row} className="border-b border-border last:border-0">
              <td className="py-1 pr-2 font-medium">{row}</td>
              {colLabels.map((col) => {
                const count = lookup.get(`${row}|${col}`) ?? 0;
                const isDiagonal = row === col;
                const intensity =
                  maxCount > 0 ? Math.min(1, count / maxCount) : 0;
                return (
                  <td
                    key={col}
                    className={cn(
                      "py-1 text-center tabular-nums",
                      isDiagonal && count > 0 && "bg-green-100",
                      !isDiagonal &&
                        count > 0 &&
                        intensity > 0.5 &&
                        "bg-red-100",
                      !isDiagonal &&
                        count > 0 &&
                        intensity <= 0.5 &&
                        "bg-yellow-50",
                    )}
                  >
                    {count === 0 ? "\u2014" : count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
