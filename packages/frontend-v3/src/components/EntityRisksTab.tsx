"use client";

import { useEntityRisks } from "@/hooks/use-risks";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Risk } from "@/lib/types";

function severityColor(severity: string): string {
  switch (severity) {
    case "critical": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "high": return "bg-amber-400/15 text-amber-400 border-amber-400/30";
    case "medium": return "bg-blue-400/15 text-blue-400 border-blue-400/30";
    case "low": return "bg-gda-green/15 text-gda-green border-gda-green/30";
    default: return "bg-border text-muted-foreground border-border";
  }
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "open": return "destructive";
    case "mitigating": return "outline";
    case "resolved": return "secondary";
    case "accepted": return "secondary";
    default: return "outline";
  }
}

interface EntityRisksTabProps {
  entityType: "opportunities" | "captures" | "pipeline";
  entityId: number;
}

export function EntityRisksTab({ entityType, entityId }: EntityRisksTabProps) {
  const { data, isLoading } = useEntityRisks(entityType, entityId);
  const risks = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gda-panel rounded" />
        ))}
      </div>
    );
  }

  if (risks.length === 0) {
    return (
      <div className="rounded border border-border bg-gda-panel p-4">
        <p className="text-xs text-muted-foreground">No risks linked to this record.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-sm font-semibold text-foreground">Risks</h3>
        <Badge variant="outline" className="text-[12px] font-mono">
          {risks.length} risk{risks.length !== 1 ? "s" : ""}
        </Badge>
      </div>
      {risks.map((risk: Risk) => {
        const score = (risk.likelihood ?? 3) * (risk.impact ?? 3);
        return (
          <a
            key={risk.id}
            href={`/risks/detail?id=${risk.id}`}
            className="flex items-center gap-3 rounded border border-border bg-gda-panel p-3 hover:border-gda-green/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{risk.title}</p>
              {risk.description && (
                <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                  {risk.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={cn("text-[12px] font-mono font-bold uppercase tracking-wide border", severityColor(risk.severity ?? "medium"))}>
                {risk.severity ?? "medium"}
              </Badge>
              <Badge variant={statusBadgeVariant(risk.status) as "outline" | "destructive" | "secondary"} className="text-[12px] capitalize">
                {risk.status}
              </Badge>
              <span className="text-[12px] font-mono text-muted-foreground">
                {score}
              </span>
            </div>
          </a>
        );
      })}
    </div>
  );
}
