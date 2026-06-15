"use client";

import { cn } from "@/lib/utils";
import type { TaskOrderFeedItem } from "@/hooks/use-idiq-ops";
import { EligibilityChip } from "./EligibilityChip";
import { HeatIcon } from "./HeatIcon";
import { useStartCapture } from "@/hooks/use-idiq-ops";

interface TaskOrderFeedProps {
  items: TaskOrderFeedItem[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function TaskOrderFeed({
  items,
  total,
  page,
  limit,
  onPageChange,
}: TaskOrderFeedProps) {
  const startCapture = useStartCapture();
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex-1 min-w-0">
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2 text-left font-medium w-[28px]" />
              <th className="px-2 py-2 text-right font-medium w-[52px]">Days</th>
              <th className="px-2 py-2 text-left font-medium">Title</th>
              <th className="px-2 py-2 text-left font-medium w-[90px]">Vehicle</th>
              <th className="px-2 py-2 text-left font-medium w-[120px]">Pool / Set-aside</th>
              <th className="px-2 py-2 text-left font-medium w-[100px]">Agency</th>
              <th className="px-2 py-2 text-right font-medium w-[80px]">Value</th>
              <th className="px-2 py-2 text-left font-medium w-[72px]">Posted</th>
              <th className="px-2 py-2 text-left font-medium w-[72px]">Closes</th>
              <th className="px-2 py-2 text-left font-medium w-[80px]">Eligibility</th>
              <th className="px-2 py-2 text-left font-medium w-[80px]">Capture</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="py-8 text-center text-xs text-muted-foreground"
                >
                  No task orders match the current filters.
                </td>
              </tr>
            ) : (
              items.map((to) => (
                <tr
                  key={to.id}
                  className="border-b border-border hover:bg-gda-panel/50 transition-colors"
                >
                  <td className="px-2 py-1.5 text-center">
                    <HeatIcon tier={to.heat_tier} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <DaysLeft days={to.days_left} />
                  </td>
                  <td className="px-2 py-1.5">
                    {to.source_url ? (
                      <a
                        href={to.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-gda-green hover:underline line-clamp-1"
                      >
                        {to.title}
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-foreground line-clamp-1">
                        {to.title}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                      {to.vehicle_short_name}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-[11px] text-muted-foreground">
                    {to.pool_or_lane || to.set_aside || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-[11px] text-muted-foreground truncate max-w-[100px]">
                    {to.agency || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[11px] tabular-nums text-foreground">
                    {to.est_value_usd
                      ? `$${formatCompact(to.est_value_usd)}`
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-[11px] text-muted-foreground tabular-nums">
                    {to.posted_date ? formatShort(to.posted_date) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-[11px] text-muted-foreground tabular-nums">
                    {to.response_due ? formatShort(to.response_due) : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <EligibilityChip
                      eligible={to.envision_eligible}
                      reason={to.eligibility_reason}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {to.capture_id ? (
                      <a
                        href={`/capture`}
                        className="text-[11px] text-gda-green hover:underline"
                      >
                        Active
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-gda-panel transition-colors"
                        onClick={() => startCapture.mutate(to.id)}
                        disabled={startCapture.isPending}
                      >
                        Start
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of{" "}
            {total}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              className="rounded border border-border px-2 py-1 text-xs disabled:opacity-40 hover:bg-gda-panel transition-colors"
              onClick={() => onPageChange(page - 1)}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              className="rounded border border-border px-2 py-1 text-xs disabled:opacity-40 hover:bg-gda-panel transition-colors"
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DaysLeft({ days }: { days: number | null }) {
  if (days == null) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "font-mono text-[11px] tabular-nums font-medium",
        days <= 3
          ? "text-red-600"
          : days <= 7
            ? "text-amber-600"
            : "text-foreground",
      )}
    >
      {days}d
    </span>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatShort(date: string): string {
  const d = new Date(date);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
