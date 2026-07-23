"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useDoctrineExclusions, type DoctrineExclusion } from "@/hooks/use-doctrine";

function ExclusionCard({ exclusion, index }: { exclusion: DoctrineExclusion; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded border border-border bg-gda-bg-base">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gda-panel/50 transition-colors"
      >
        <span className="font-mono text-[12px] text-muted-foreground w-5 shrink-0 pt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-foreground">{exclusion.name}</p>
            {exclusion.is_hard_block && (
              <span className="rounded border border-gda-red/40 bg-gda-red/10 px-1.5 py-0.5 text-[12px] font-mono text-gda-red">
                HARD BLOCK
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{exclusion.description}</p>
        </div>
        <span className={cn("text-xs text-muted-foreground transition-transform shrink-0", expanded && "rotate-180")}>
          v
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          <div className="space-y-1">
            <span className="text-[12px] font-mono text-muted-foreground uppercase tracking-wider">
              Description
            </span>
            <p className="text-xs text-foreground">{exclusion.description}</p>
          </div>

          <div className="space-y-1">
            <span className="text-[12px] font-mono text-muted-foreground uppercase tracking-wider">
              Applies to OUs
            </span>
            <div className="flex flex-wrap gap-1.5">
              {exclusion.applies_to_ous.map((ou) => (
                <span
                  key={ou}
                  className="rounded border border-border bg-gda-panel px-2 py-0.5 text-[12px] font-mono text-foreground"
                >
                  {ou}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[12px] font-mono text-muted-foreground uppercase tracking-wider">
              Override requires
            </span>
            <p className="text-xs text-foreground">
              {exclusion.override_requires ?? "No override available"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function ExclusionsSection() {
  const { data: exclusions, isLoading } = useDoctrineExclusions();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-gda-bg-base" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        The 6 strategic exclusions are hard-block rules. When triggered, the Qualify button is disabled
        and an override requires written executive rationale (min 50 chars) logged permanently.
      </p>
      <div className="space-y-2">
        {(exclusions ?? []).map((excl, i) => (
          <ExclusionCard key={excl.id} exclusion={excl} index={i} />
        ))}
      </div>
    </div>
  );
}
