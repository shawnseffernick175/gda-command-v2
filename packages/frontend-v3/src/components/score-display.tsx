"use client";

import { cn } from "@/lib/utils";

export function ScoreDisplay({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const color =
    score >= 70
      ? "text-gda-green"
      : score >= 50
        ? "text-gda-amber"
        : score >= 30
          ? "text-gda-orange"
          : "text-gda-red";

  return (
    <span className={cn("font-mono text-lg font-bold", color, className)}>
      {Math.round(score)}
    </span>
  );
}
