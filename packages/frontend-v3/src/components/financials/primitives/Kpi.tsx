"use client";

import { cn } from "@/lib/utils";

export function Kpi({
  label,
  value,
  subtitle,
  className,
}: {
  label: string;
  value: string;
  subtitle?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded border border-border bg-card p-4 min-h-[88px]",
        className,
      )}
    >
      <p className="text-[12px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground leading-none">
        {value}
      </p>
      {subtitle ? (
        <p className="mt-1 text-[12px] text-muted-foreground">{subtitle}</p>
      ) : (
        <p className="mt-1 text-[12px] text-transparent select-none">{"\u00A0"}</p>
      )}
    </div>
  );
}
