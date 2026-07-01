"use client";

import { cn } from "@/lib/utils";

interface MarginGaugeProps {
  marginPct: number;
  doctrinePass: boolean;
  size?: "sm" | "md";
}

export function MarginGauge({
  marginPct,
  doctrinePass,
  size = "sm",
}: MarginGaugeProps) {
  const rounded = Math.round(marginPct * 10) / 10;
  const isMd = size === "md";

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex items-center gap-1.5 rounded border px-2 py-0.5",
          doctrinePass
            ? "border-accent/30 bg-accent/5"
            : "border-critical/30 bg-critical/5",
        )}
      >
        <span
          className={cn(
            "font-semibold tabular-nums",
            isMd ? "text-[15px]" : "text-[13px]",
            doctrinePass ? "text-accent" : "text-critical",
          )}
        >
          {rounded}%
        </span>
      </div>
      <span
        className={cn(
          "rounded font-semibold",
          isMd ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]",
          doctrinePass
            ? "bg-accent/10 text-accent"
            : "bg-critical text-white",
        )}
      >
        {doctrinePass ? "PASS" : "FAIL"}
      </span>
    </div>
  );
}
