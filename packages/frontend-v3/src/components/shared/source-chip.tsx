"use client";

import { cn } from "@/lib/utils";

type ChipKind = "real" | "heuristic" | "pending";

export function SourceChip({
  label,
  url,
  kind = "real",
  className,
}: {
  label: string;
  url?: string | null;
  kind?: ChipKind;
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-mono leading-tight border";

  const kindStyles: Record<ChipKind, string> = {
    real: "border-gda-cyan/30 bg-gda-cyan/10 text-gda-cyan",
    heuristic:
      "border-gda-amber/30 bg-gda-amber/10 text-gda-amber",
    pending:
      "border-border bg-muted/10 text-muted-foreground italic",
  };

  const clickableReal = "hover:bg-gda-cyan/20 cursor-pointer";

  if (url && kind === "real") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(base, kindStyles[kind], clickableReal, className)}
      >
        {label}
      </a>
    );
  }

  return (
    <span className={cn(base, kindStyles[kind], className)}>
      {kind === "heuristic" && "~ "}
      {kind === "pending" && "... "}
      {label}
    </span>
  );
}
