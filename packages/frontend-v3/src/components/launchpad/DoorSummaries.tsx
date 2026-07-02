"use client";

import Link from "next/link";
import { useDoorSummaries } from "@/hooks/use-launchpad";
import { Skeleton } from "@/components/ui/skeleton";

const DOOR_PATHS: Record<string, string> = {
  opportunities: "/opportunities",
  pipeline: "/pipeline",
  capture: "/captures",
  action_items: "/action-items",
  partner_intel: "/partners",
  risks: "/risks",
  sentinel: "/sentinel",
};

export default function DoorSummaries() {
  const { data, isLoading } = useDoorSummaries();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 bg-gda-panel" />
        ))}
      </div>
    );
  }

  const summaries = data?.summaries ?? [];
  if (summaries.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {summaries.map((door) => {
        const href = DOOR_PATHS[door.door_key] ?? "/";
        return (
          <Link
            key={door.door_key}
            href={href}
            className="rounded border border-border bg-gda-panel p-3 hover:bg-gda-panel-alt transition-colors block"
          >
            <h3 className="font-mono text-[11px] font-bold text-gda-cyan uppercase tracking-widest mb-1">
              {door.door_label}
            </h3>
            <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
              {door.summary}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
