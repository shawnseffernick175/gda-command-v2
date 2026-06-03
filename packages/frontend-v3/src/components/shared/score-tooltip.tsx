"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function ScoreTooltip({
  score,
  label,
  explanation,
  scale,
  drivers,
  isHeuristic = false,
  children,
  className,
}: {
  score?: number | string | null;
  label: string;
  explanation: string;
  scale?: string;
  drivers?: string[];
  isHeuristic?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <span
      className={cn("relative inline-flex items-center gap-1", className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground hover:bg-gda-panel"
        aria-label={`Explain ${label}`}
      >
        ?
      </button>
      {show && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded border border-border bg-gda-bg-raised p-3 text-xs shadow-lg">
          <p className="font-mono font-bold text-foreground">{label}</p>
          {score != null && (
            <p className="mt-1 text-muted-foreground">
              Value: <span className="font-mono text-foreground">{score}</span>
            </p>
          )}
          <p className="mt-1 text-muted-foreground">{explanation}</p>
          {scale && (
            <p className="mt-1 text-muted-foreground">Scale: {scale}</p>
          )}
          {drivers && drivers.length > 0 && (
            <div className="mt-1">
              <p className="text-muted-foreground">Drivers:</p>
              <ul className="ml-3 list-disc text-muted-foreground">
                {drivers.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {isHeuristic && (
            <p className="mt-1 italic text-gda-amber">
              Heuristic — verify before relying on this value
            </p>
          )}
        </div>
      )}
    </span>
  );
}
