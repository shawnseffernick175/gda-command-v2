"use client";

import Link from "next/link";
import { useLaunchpadRisks } from "@/hooks/use-risks";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

function severityColor(severity: string) {
  switch (severity) {
    case "critical":
      return "border-l-critical text-critical";
    case "high":
      return "border-l-red-500 text-red-400";
    default:
      return "border-l-amber-400 text-amber-400";
  }
}

function severityBg(severity: string) {
  switch (severity) {
    case "critical":
      return "bg-critical/10 text-critical border-critical/30";
    case "high":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    default:
      return "bg-amber-400/10 text-amber-400 border-amber-400/30";
  }
}

export default function WhatsAtRisk() {
  const { data, isLoading } = useLaunchpadRisks();
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-critical" />
          <h3 className="text-body font-semibold text-ink">What&#39;s at Risk</h3>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-bg rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-accent" />
          <h3 className="text-body font-semibold text-ink">What&#39;s at Risk</h3>
        </div>
        <p className="text-caption text-muted">No critical or high-severity open risks.</p>
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-critical" />
          <h3 className="text-body font-semibold text-ink">What&#39;s at Risk</h3>
        </div>
        <Link
          href="/risks?status=open&severity=critical|high"
          className="text-caption text-accent hover:underline"
        >
          View all
        </Link>
      </div>

      <div className="space-y-2">
        {items.map((risk) => (
          <Link
            key={risk.id}
            href={`/risks?highlight=${risk.id}`}
            className={cn(
              "block rounded border border-border p-3 border-l-4 hover:bg-bg/80 transition-colors",
              severityColor(risk.severity),
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-caption font-medium text-ink truncate">
                  {risk.title}
                </p>
                {risk.opportunity_title && (
                  <p className="text-caption text-muted truncate mt-0.5">
                    {risk.opportunity_title}
                  </p>
                )}
              </div>
              <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-caption font-medium uppercase", severityBg(risk.severity))}>
                {risk.severity}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-caption text-muted">
              <span>{(risk.category ?? "other").replace(/_/g, " ")}</span>
              {risk.owner && <span>Owner: {risk.owner}</span>}
              {risk.identified_at && (
                <span className="tabular-nums">
                  {new Date(risk.identified_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
