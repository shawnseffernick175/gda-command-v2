"use client";

import { cn } from "@/lib/utils";

type EvidenceGrade = "A" | "B" | "C";

const GRADE_STYLES: Record<EvidenceGrade, string> = {
  A: "border-gda-green/60 text-gda-green bg-gda-green/10",
  B: "border-gda-amber/60 text-gda-amber bg-gda-amber/10",
  C: "border-gda-red/60 text-gda-red bg-gda-red/10",
};

const GRADE_LABELS: Record<EvidenceGrade, string> = {
  A: "Primary source (contracts, budgets, CPARs, FPDS, SAM.gov, federal register)",
  B: "Secondary source (GovWin, trade press, FOIA reading rooms, public award notices)",
  C: "Hypothesis (customer conversation, tribal knowledge)",
};

export function EvidenceBadge({
  grade,
  className,
  showWarning,
}: {
  grade: EvidenceGrade;
  className?: string;
  showWarning?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1 py-0.5 text-[12px] font-mono font-bold leading-none",
        GRADE_STYLES[grade],
        className,
      )}
      title={GRADE_LABELS[grade]}
    >
      [{grade}]
      {showWarning && grade === "C" && (
        <span className="ml-0.5 text-gda-red" title="Hypothesis-grade evidence on must-win pursuit">
          !
        </span>
      )}
    </span>
  );
}
