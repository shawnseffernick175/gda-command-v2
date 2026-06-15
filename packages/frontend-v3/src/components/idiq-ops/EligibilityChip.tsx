"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface EligibilityChipProps {
  eligible: boolean | null;
  reason: string | null;
}

export function EligibilityChip({ eligible, reason }: EligibilityChipProps) {
  const label =
    eligible === true
      ? "Eligible"
      : eligible === false
        ? "Not eligible"
        : "Unclear";

  const chipClass =
    eligible === true
      ? "border-gda-green/40 text-gda-green bg-gda-green/5"
      : eligible === false
        ? "border-border text-muted-foreground bg-transparent"
        : "border-amber-400/40 text-amber-600 bg-amber-50";

  const chip = (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        chipClass,
      )}
    >
      {label}
    </span>
  );

  if (!reason) return chip;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-default" />}>
        {chip}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px]">
        <p className="text-xs leading-relaxed">{reason}</p>
      </TooltipContent>
    </Tooltip>
  );
}
