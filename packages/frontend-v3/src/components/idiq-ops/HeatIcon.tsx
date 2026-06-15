"use client";

import { cn } from "@/lib/utils";

interface HeatIconProps {
  tier: "hot" | "eligible" | "watch" | "not_eligible";
}

const HEAT_CONFIG: Record<
  string,
  { dot: string; label: string }
> = {
  hot: { dot: "bg-red-500", label: "Hot" },
  eligible: { dot: "bg-gda-green", label: "Eligible" },
  watch: { dot: "bg-amber-400", label: "Watch" },
  not_eligible: { dot: "bg-border", label: "Not eligible" },
};

export function HeatIcon({ tier }: HeatIconProps) {
  const config = HEAT_CONFIG[tier] ?? HEAT_CONFIG.watch;
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", config.dot)}
      title={config.label}
    />
  );
}
