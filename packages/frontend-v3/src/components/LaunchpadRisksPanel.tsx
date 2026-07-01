"use client";

import Link from "next/link";
import { useLaunchpadRisks } from "@/hooks/use-risks";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Risk } from "@/lib/types";
import { AlertTriangleIcon } from "lucide-react";

function severityColor(severity: string): string {
  switch (severity) {
    case "critical": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "high": return "bg-amber-400/15 text-amber-400 border-amber-400/30";
    case "medium": return "bg-blue-400/15 text-blue-400 border-blue-400/30";
    case "low": return "bg-gda-green/15 text-gda-green border-gda-green/30";
    default: return "bg-border text-muted-foreground border-border";
  }
}

function RiskRow({ risk }: { risk: Risk }) {
  const score = (risk.likelihood ?? 3) * (risk.impact ?? 3);
  return (
    <Link
      href={`/risks/${risk.id}`}
      className="flex items-center gap-3 rounded border border-border bg-gda-panel p-3 hover:border-gda-green/30 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{risk.title}</p>
        {risk.opportunity_title && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {risk.opportunity_title}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge className={cn("text-[10px] font-mono font-bold uppercase tracking-wide border", severityColor(risk.severity ?? "medium"))}>
          {risk.severity ?? "medium"}
        </Badge>
        <span className="text-[11px] font-mono text-muted-foreground">
          {score}
        </span>
      </div>
    </Link>
  );
}

export function LaunchpadRisksPanel() {
  const { data, isLoading } = useLaunchpadRisks();

  if (isLoading) {
    return (
      <div className="rounded border border-border bg-gda-panel p-4 space-y-3 animate-pulse">
        <div className="h-4 bg-gda-bg-base rounded w-1/3" />
        <div className="h-10 bg-gda-bg-base rounded" />
        <div className="h-10 bg-gda-bg-base rounded" />
      </div>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const warning = data?.owner_concentration_warning;

  return (
    <div className="rounded border border-border bg-gda-bg-base p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangleIcon className="h-4 w-4 text-red-400" />
          <h3 className="font-mono text-sm font-bold text-foreground">
            What's at Risk
          </h3>
        </div>
        <Badge variant="outline" className="text-[11px] font-mono">
          {total} critical/high
        </Badge>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No critical or high-severity open risks.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((risk) => (
            <RiskRow key={risk.id} risk={risk} />
          ))}
        </div>
      )}

      {warning && (
        <div className="rounded border border-amber-400/30 bg-amber-400/5 p-2">
          <p className="text-[11px] text-amber-400">
            Owner concentration alert: {warning.owner} owns {warning.percentage}% of critical/high risks.
          </p>
        </div>
      )}

      {total > 5 && (
        <Link
          href="/risks?severity=critical|high&status=open"
          className="block text-center text-[11px] text-gda-green hover:underline"
        >
          View all {total} risks
        </Link>
      )}
    </div>
  );
}
