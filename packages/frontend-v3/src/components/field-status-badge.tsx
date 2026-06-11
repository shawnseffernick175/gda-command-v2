"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type FieldStatusReason =
  | "pending_analysis"
  | "no_source_data"
  | "validation_cleared";

interface FieldStatusBadgeProps {
  reason: FieldStatusReason;
  className?: string;
}

const CONFIG: Record<
  FieldStatusReason,
  { label: string; tooltip: string; style: string }
> = {
  pending_analysis: {
    label: "Pending Analysis",
    tooltip:
      "AI analysis hasn\u2019t run yet. Check back in a few hours.",
    style: "text-gda-amber border-gda-amber/40",
  },
  no_source_data: {
    label: "No Source Data",
    tooltip:
      "SAM.gov / FPDS never published this field.",
    style: "text-muted-foreground border-border",
  },
  validation_cleared: {
    label: "Cleared by validator",
    tooltip:
      "Field was removed because the source data was invalid (e.g., due date before posted date).",
    style: "text-gda-red border-gda-red/40",
  },
};

export function FieldStatusBadge({ reason, className }: FieldStatusBadgeProps) {
  const { label, tooltip, style } = CONFIG[reason];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="outline"
            aria-label={tooltip}
            className={cn("text-[11px] font-mono cursor-default", style, className)}
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
