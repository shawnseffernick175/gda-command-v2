"use client";

import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

type NumberFormat = "money" | "percent" | "days" | "docs" | "raw";

export function NumberCell({
  value,
  format = "money",
  className,
  tooltip,
}: {
  value: number | null | undefined;
  format?: NumberFormat;
  className?: string;
  tooltip?: string;
}) {
  if (value == null) {
    return (
      <span
        className={cn("text-muted-foreground", className)}
        title={tooltip ?? "Data not available"}
      >
        {"\u2014"}
      </span>
    );
  }

  let display: string;
  switch (format) {
    case "money":
      display = formatMoney(value);
      break;
    case "percent":
      display = `${value.toFixed(1)}%`;
      break;
    case "days":
      display = `${Math.round(value)} days`;
      break;
    case "docs":
      display = `${Math.round(value)} docs`;
      break;
    case "raw":
      display = value.toLocaleString();
      break;
    default:
      display = String(value);
      break;
  }

  return (
    <span className={cn("tabular-nums", className)} title={tooltip}>
      {display}
    </span>
  );
}
