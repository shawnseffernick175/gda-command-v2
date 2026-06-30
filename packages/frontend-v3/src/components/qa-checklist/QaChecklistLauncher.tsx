"use client";

import { cn } from "@/lib/utils";
import { useQaChecklist } from "./qa-checklist-context";

export function QaChecklistLauncher() {
  const { toggle, isOpen } = useQaChecklist();

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "fixed right-0 top-1/2 z-40 -translate-y-1/2",
        "rounded-l border border-r-0 border-border",
        "px-1.5 py-3 font-mono text-[11px] font-semibold",
        "transition-colors [writing-mode:vertical-rl]",
        isOpen
          ? "bg-gda-green text-gda-bg-deep"
          : "bg-gda-panel text-muted-foreground hover:bg-gda-panel-alt hover:text-foreground",
      )}
      aria-label="Toggle QA Checklist"
    >
      QA
    </button>
  );
}
