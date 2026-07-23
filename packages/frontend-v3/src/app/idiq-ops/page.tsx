"use client";

import { useIdiqOpsPursuits } from "@/hooks/use-idiq-ops";
import type { IdiqPursuitItem } from "@/hooks/use-idiq-ops";
import { Skeleton } from "@/components/ui/skeleton";

const STAGE_LABELS: Record<string, string> = {
  interest: "Interest",
  qualify: "Qualify",
  qualified: "Qualified",
  pursue: "Pursue",
  solicitation: "Solicitation",
  post_submittal: "Post-Submittal",
  won: "Won",
  lost: "Lost",
  no_bid: "No Bid",
  gov_cancelled: "Gov Cancelled",
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

function formatValue(val: number): string {
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return val > 0 ? `$${val.toLocaleString()}` : "IDIQ";
}

export default function IdiqOpsPage() {
  const { data, isLoading, error } = useIdiqOpsPursuits();

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 sticky-page-header">
        <div className="flex items-baseline gap-3">
          <h1 className="shrink-0 text-lg font-semibold text-foreground">
            IDIQ Operations
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            IDIQ contract pursuits on the capture pipeline — win the vehicle seat, then compete for task orders.
          </p>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <div className="rounded border border-gda-red/30 bg-gda-red/10 px-4 py-3">
          <p className="text-xs text-gda-red">
            Failed to load IDIQ pursuits: {error.message}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded border border-border bg-gda-panel px-8 py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            No IDIQ pursuits on the pipeline
          </p>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground">
            IDIQ Operations tracks contract vehicles (RS3, OASIS+, SeaPort-NxG,
            etc.) that Envision is actively pursuing or holds. Opportunities
            flagged as IDIQ on the capture pipeline appear here automatically.
            Promote an IDIQ opportunity to the pipeline to see it on this board.
          </p>
        </div>
      ) : (
        <PursuitTable items={items} />
      )}
    </div>
  );
}

/* ── Pursuit Table ────────────────────────────────────────────── */

function PursuitTable({ items }: { items: IdiqPursuitItem[] }) {
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-gda-panel">
            <th className="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Vehicle / Pursuit
            </th>
            <th className="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Agency
            </th>
            <th className="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Stage
            </th>
            <th className="px-3 py-2 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Value
            </th>
            <th className="px-3 py-2 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Pwin
            </th>
            <th className="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Owner
            </th>
            <th className="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Due
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b border-border last:border-b-0 hover:bg-gda-bg-base transition-colors"
            >
              <td className="px-3 py-2.5">
                <span className="text-sm font-medium text-foreground">
                  {item.opportunity_title}
                </span>
                {item.solicitation_number && (
                  <span className="ml-2 text-[12px] text-muted-foreground">
                    {item.solicitation_number}
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {item.opportunity_agency ?? "\u2014"}
              </td>
              <td className="px-3 py-2.5">
                <span className="inline-block rounded border border-border px-2 py-0.5 text-[12px] font-medium text-foreground">
                  {stageLabel(item.stage)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                {formatValue(item.resolved_value)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                {item.resolved_pwin != null
                  ? `${Math.round(item.resolved_pwin)}%`
                  : "\u2014"}
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {item.capture_owner}
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                {item.opportunity_due_at
                  ? new Date(item.opportunity_due_at).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    )
                  : "\u2014"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────── */

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 bg-gda-panel" />
      ))}
    </div>
  );
}
