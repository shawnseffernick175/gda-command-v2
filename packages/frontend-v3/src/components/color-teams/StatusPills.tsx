"use client";

import type { ColorTeamRun, ColorTeamColorCount } from "@/lib/types";

const COLOR_LABELS: Record<string, string> = {
  pink: "Pink",
  red: "Red",
  black: "Black Hat",
  blue: "Blue",
  white: "White",
  green: "Green",
};

const STATUS_CLASSES: Record<string, string> = {
  queued: "border-muted-foreground/30 text-muted-foreground",
  running: "border-gda-amber/40 text-gda-amber animate-pulse",
  complete: "border-gda-green/40 text-gda-green",
  error: "border-gda-red/40 text-gda-red",
};

const COLOR_BAR_CLASSES: Record<string, string> = {
  pink: "bg-pink-400",
  red: "bg-gda-red",
  black: "bg-zinc-400",
  blue: "bg-blue-400",
  white: "bg-gray-300",
  green: "bg-gda-green",
};

interface StatusPillsProps {
  run: ColorTeamRun;
}

export function StatusPills({ run }: StatusPillsProps) {
  const statusClass = STATUS_CLASSES[run.status] ?? STATUS_CLASSES.queued;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`rounded border px-2 py-0.5 text-xs font-medium ${statusClass}`}
      >
        {run.status.toUpperCase()}
      </span>
      {run.colors.map((color) => {
        const count = run.finding_counts?.find(
          (c: ColorTeamColorCount) => c.color === color,
        )?.count;
        return (
          <span
            key={color}
            className="flex items-center gap-1.5 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground"
          >
            <span
              className={`h-2 w-2 rounded-full ${COLOR_BAR_CLASSES[color] ?? "bg-muted-foreground"}`}
            />
            {COLOR_LABELS[color] ?? color}
            {count != null && (
              <span className="ml-0.5 font-mono text-foreground">{count}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
