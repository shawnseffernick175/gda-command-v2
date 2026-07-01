"use client";

import { useState } from "react";
import { useSendFindingToActionItem } from "@/hooks/use-color-teams";
import type { ColorTeamFinding } from "@/lib/types";

const SEVERITY_CLASSES: Record<string, string> = {
  info: "bg-gda-cyan/20 text-gda-cyan border-gda-cyan/30",
  warning: "bg-gda-amber/20 text-gda-amber border-gda-amber/30",
  critical: "bg-[#A12C7B]/20 text-[#A12C7B] border-[#A12C7B]/30",
  blocker: "bg-gda-red/20 text-gda-red border-gda-red/30",
};

const SEVERITY_BAR: Record<string, string> = {
  info: "border-l-gda-cyan",
  warning: "border-l-gda-amber",
  critical: "border-l-[#A12C7B]",
  blocker: "border-l-gda-red",
};

const GRADE_CLASSES: Record<string, string> = {
  A: "bg-gda-green/15 text-gda-green border-gda-green/30",
  B: "bg-gda-cyan/15 text-gda-cyan border-gda-cyan/30",
  C: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
};

interface FindingCardProps {
  finding: ColorTeamFinding;
  diffTag?: "new" | "resolved" | "regressed" | null;
}

export function FindingCard({ finding, diffTag }: FindingCardProps) {
  const sendToAI = useSendFindingToActionItem();
  const [sent, setSent] = useState(!!finding.action_item_id);

  async function handleSendToActionItem() {
    await sendToAI.mutateAsync(finding.id);
    setSent(true);
  }

  const diffBadge = diffTag
    ? {
        new: "bg-gda-green/15 text-gda-green border-gda-green/30",
        resolved: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
        regressed: "bg-gda-red/15 text-gda-red border-gda-red/30",
      }[diffTag]
    : null;

  return (
    <div
      className={`rounded border border-border border-l-[3px] bg-gda-panel p-3 ${SEVERITY_BAR[finding.severity] ?? ""}`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase ${SEVERITY_CLASSES[finding.severity] ?? ""}`}
        >
          {finding.severity}
        </span>
        {finding.section_ref && (
          <span className="text-xs text-muted-foreground">
            {finding.section_ref}
          </span>
        )}
        {diffTag && diffBadge && (
          <span className={`rounded border px-1.5 py-0.5 text-[11px] ${diffBadge}`}>
            {diffTag.toUpperCase()}
          </span>
        )}
      </div>

      <p className="text-sm text-foreground">{finding.finding}</p>

      {finding.recommended_fix && (
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Fix: </span>
          {finding.recommended_fix}
        </p>
      )}

      {finding.citations.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {finding.citations.map((c, i) => (
            <a
              key={i}
              href={c.url !== "#" ? c.url : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] ${GRADE_CLASSES[c.grade] ?? GRADE_CLASSES.C}`}
            >
              [{c.grade}] {c.source}
            </a>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={handleSendToActionItem}
          disabled={sent || sendToAI.isPending}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-gda-panel-alt hover:text-foreground disabled:opacity-40"
        >
          {sent ? "Sent to Action Items" : sendToAI.isPending ? "Sending..." : "Send to Action Items"}
        </button>
      </div>
    </div>
  );
}
