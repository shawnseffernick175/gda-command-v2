"use client";

import { useState } from "react";
import { useOpportunityRisks } from "@/hooks/use-risks";
import { RiskDetailPanel } from "@/components/RiskDetailPanel";
import { cn } from "@/lib/utils";
import type { Risk } from "@/lib/types";
import { AlertTriangle } from "lucide-react";

function severityBadge(severity: string) {
  switch (severity) {
    case "critical":
      return "bg-critical/10 text-critical border-critical/30";
    case "high":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    case "medium":
      return "bg-amber-400/10 text-amber-400 border-amber-400/30";
    case "low":
      return "bg-accent/10 text-accent border-accent/30";
    default:
      return "bg-muted/10 text-muted-foreground border-border";
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "open":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    case "mitigating":
      return "bg-amber-400/10 text-amber-400 border-amber-400/30";
    case "resolved":
      return "bg-accent/10 text-accent border-accent/30";
    default:
      return "bg-muted/10 text-muted-foreground border-border";
  }
}

export function OpportunityRisksPanel({ opportunityId }: { opportunityId: number }) {
  const { data, isLoading } = useOpportunityRisks(opportunityId);
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
  const risks = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="rounded border border-border bg-white p-4 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground uppercase">Risks</span>
        </div>
        <div className="h-8 bg-gda-panel rounded animate-pulse" />
      </div>
    );
  }

  if (risks.length === 0) {
    return (
      <div className="rounded border border-border bg-white p-4 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground uppercase">Risks</span>
        </div>
        <p className="text-xs text-muted-foreground">No risks identified for this opportunity.</p>
      </div>
    );
  }

  const openCount = risks.filter((r) => r.status === "open").length;
  const criticalCount = risks.filter((r) => r.severity === "critical" && r.status === "open").length;

  return (
    <div className="rounded border border-border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className={criticalCount > 0 ? "text-critical" : "text-muted-foreground"} />
          <span className="text-xs font-mono text-muted-foreground uppercase">Risks</span>
          <span className="text-xs text-muted-foreground">({risks.length})</span>
        </div>
        {openCount > 0 && (
          <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-mono font-medium", statusBadge("open"))}>
            {openCount} open
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {risks.map((risk) => (
          <button
            key={risk.id}
            type="button"
            onClick={() => setSelectedRisk(risk)}
            className="w-full text-left flex items-center gap-2 rounded border border-border px-3 py-2 text-xs hover:bg-gda-panel/50 transition-colors"
          >
            <span className={cn("shrink-0 rounded border px-1 py-0.5 text-[10px] font-mono font-medium uppercase", severityBadge(risk.severity))}>
              {risk.severity}
            </span>
            <span className="flex-1 truncate text-foreground">{risk.title}</span>
            <span className={cn("shrink-0 rounded border px-1 py-0.5 text-[10px] font-mono", statusBadge(risk.status))}>
              {risk.status}
            </span>
          </button>
        ))}
      </div>

      {selectedRisk && (
        <RiskDetailPanel
          risk={selectedRisk}
          onClose={() => setSelectedRisk(null)}
        />
      )}
    </div>
  );
}
