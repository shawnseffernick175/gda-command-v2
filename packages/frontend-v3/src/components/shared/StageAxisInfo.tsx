"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * GDA has three independent "stage"-like systems that look similar but answer
 * different questions. Historically a control could move one while the user
 * assumed it moved another. This component labels which axis a given control /
 * view operates on and, on hover, spells out all three so they are never
 * silently conflated. It changes NO data — it is pure clarification.
 *
 * The three axes (see docs/canonical/stage_systems_v1.md):
 *  - capture     — where a pursuit sits in the BD process (the only axis a
 *                  "move stage" action changes).
 *  - color_team  — which proposal review gate a draft has cleared.
 *  - coverage    — the AOP doctrine funnel used to size the pipeline; a
 *                  reporting rollup, not a per-opportunity status.
 */
export type StageAxis = "capture" | "color_team" | "coverage";

const AXES: {
  key: StageAxis;
  name: string;
  blurb: string;
  values: string;
}[] = [
  {
    key: "capture",
    name: "Capture / pipeline stage",
    blurb:
      "Where a pursuit sits in the BD process. This is the only axis a “move stage” action changes.",
    values:
      "Interest → Qualify → Qualified → Pursue → Solicitation → Submission → Won / Lost / No Bid",
  },
  {
    key: "color_team",
    name: "Color-team review",
    blurb:
      "Which proposal review gate a draft has cleared. Independent of capture stage.",
    values: "Blue · Pink · Red · Green · White (compliance)",
  },
  {
    key: "coverage",
    name: "AOP coverage layer",
    blurb:
      "Doctrine funnel used to size the pipeline against the AOP target. A reporting rollup, not a per-opportunity status.",
    values: "AOP · Identification · Pursuit · Capture · Proposal · Evaluation",
  },
];

const AXIS_LABEL: Record<StageAxis, string> = {
  capture: "Capture stage",
  color_team: "Color-team review",
  coverage: "AOP coverage layer",
};

export function StageAxisInfo({
  axis,
  className,
}: {
  axis: StageAxis;
  className?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <span
      className={cn("relative inline-flex items-center gap-1", className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-wide text-muted-foreground">
        {AXIS_LABEL[axis]}
      </span>
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[12px] text-muted-foreground hover:bg-gda-panel"
        aria-label="Explain the three stage systems"
      >
        ?
      </button>
      {show && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded border border-border bg-gda-bg-raised p-3 text-xs shadow-lg">
          <p className="font-mono font-bold text-foreground">
            Three separate stage systems
          </p>
          <p className="mt-1 text-muted-foreground">
            These are independent — advancing one does not change the others.
          </p>
          <ul className="mt-2 space-y-2">
            {AXES.map((a) => (
              <li
                key={a.key}
                className={cn(
                  "rounded border px-2 py-1.5",
                  a.key === axis
                    ? "border-gda-cyan/60 bg-gda-cyan/10"
                    : "border-border",
                )}
              >
                <p className="font-mono font-medium text-foreground">
                  {a.name}
                  {a.key === axis && (
                    <span className="ml-1 text-gda-cyan">(this control)</span>
                  )}
                </p>
                <p className="mt-0.5 text-muted-foreground">{a.blurb}</p>
                <p className="mt-0.5 font-mono text-[12px] text-muted-foreground">
                  {a.values}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
