import { type ReactNode } from "react";

export interface MetricProps {
  label: string;
  value: ReactNode;
  sourceUrl: string;
  trend?: "up" | "down" | "flat";
}

export function Metric({ label, value, sourceUrl, trend }: MetricProps) {
  const trendColor =
    trend === "up" ? "text-success" : trend === "down" ? "text-critical" : "text-ink-muted";

  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-0.5 group"
    >
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-2xl font-semibold text-ink-primary group-hover:text-accent transition-colors duration-[var(--duration-state)]">
        {value}
      </span>
      {trend && (
        <span className={`text-xs ${trendColor}`}>
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
        </span>
      )}
    </a>
  );
}
