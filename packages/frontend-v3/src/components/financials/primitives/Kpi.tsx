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
        "rounded border border-border bg-card p-4",
        className,
      )}
    >
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
