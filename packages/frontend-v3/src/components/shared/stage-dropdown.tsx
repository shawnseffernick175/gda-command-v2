"use client";

import { useState } from "react";
import {
  ALL_STAGES,
  stageColor,
  stageToDoctrinePhase,
  type Stage,
} from "@/lib/stages";
import { cn } from "@/lib/utils";

export function StageDropdown({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange?: (stage: Stage) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Outward-facing capture-doctrine phase (display-only). DB keys / workflow
  // are unchanged; this chip just reports the level of capture.
  const phase = stageToDoctrinePhase(value);

  // Read-only usage (no onChange): render a static phase chip.
  if (!onChange) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded border border-border px-2 py-1 text-xs font-mono",
          stageColor(phase),
          className,
        )}
      >
        {phase}
      </span>
    );
  }

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-mono transition-colors hover:bg-gda-panel",
          stageColor(phase),
        )}
      >
        {phase}
        <span className="text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded border border-border bg-gda-bg-raised shadow-lg">
          {ALL_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              className={cn(
                "block w-full px-3 py-1.5 text-left text-xs font-mono transition-colors hover:bg-gda-panel",
                stageColor(stage),
                stage === value && "bg-gda-panel",
              )}
              onClick={() => {
                onChange(stage);
                setOpen(false);
              }}
            >
              {stage}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
