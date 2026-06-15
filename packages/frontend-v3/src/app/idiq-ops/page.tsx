"use client";

import { useState } from "react";
import {
  useIdiqOpsFeed,
  useIdiqOpsScoreboard,
  useIdiqOpsKpis,
} from "@/hooks/use-idiq-ops";
import type { FeedFilters } from "@/hooks/use-idiq-ops";
import { TaskOrderFeed } from "@/components/idiq-ops/TaskOrderFeed";
import { FilterRail } from "@/components/idiq-ops/FilterRail";
import { VehicleScoreboard } from "@/components/idiq-ops/VehicleScoreboard";
import { Skeleton } from "@/components/ui/skeleton";

export default function IdiqOpsPage() {
  const [filters, setFilters] = useState<FeedFilters>({
    status: "open",
    page: 1,
    limit: 50,
  });

  const { data: feedData, isLoading: feedLoading } = useIdiqOpsFeed(filters);
  const { data: scoreboard, isLoading: scoreboardLoading } =
    useIdiqOpsScoreboard();
  const { data: kpis } = useIdiqOpsKpis();

  const handleVehicleSelect = (vehicleId: number | undefined) => {
    setFilters((f) => ({ ...f, vehicle_id: vehicleId, page: 1 }));
  };

  return (
    <div className="space-y-4">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 sticky-page-header">
        <h1 className="text-lg font-semibold text-foreground">
          IDIQ Operations
        </h1>
      </div>

      {/* KPI strip */}
      <KpiStrip kpis={kpis} />

      {/* Main layout: filter rail | feed table | vehicle scoreboard */}
      <div className="flex gap-4">
        <FilterRail
          filters={filters}
          onChange={setFilters}
          vehicles={scoreboard ?? []}
        />

        {feedLoading ? (
          <div className="flex-1 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 bg-gda-panel" />
            ))}
          </div>
        ) : (
          <TaskOrderFeed
            items={feedData?.items ?? []}
            total={feedData?.total ?? 0}
            page={feedData?.page ?? 1}
            limit={feedData?.limit ?? 50}
            onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
          />
        )}

        {scoreboardLoading ? (
          <div className="w-[260px] shrink-0 space-y-2 border-l border-border pl-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 bg-gda-panel" />
            ))}
          </div>
        ) : (
          <VehicleScoreboard
            vehicles={scoreboard ?? []}
            selectedVehicleId={filters.vehicle_id}
            onSelect={handleVehicleSelect}
          />
        )}
      </div>
    </div>
  );
}

/* ── KPI Header Strip ─────────────────────────────────────────── */

interface KpiStripProps {
  kpis:
    | {
        open_eligible: number;
        hot_tos: number;
        submitted_qtd: number;
        awarded_ltm: number;
        win_rate_ltm: number;
      }
    | undefined;
}

function KpiStrip({ kpis }: KpiStripProps) {
  const items = [
    { label: "Open TOs (eligible)", value: kpis?.open_eligible },
    { label: "Hot TOs", value: kpis?.hot_tos },
    { label: "Submitted (QTD)", value: kpis?.submitted_qtd },
    { label: "Awarded (LTM)", value: kpis?.awarded_ltm },
    {
      label: "Win rate (LTM)",
      value: kpis?.win_rate_ltm,
      suffix: "%",
    },
  ];

  return (
    <div className="flex items-center gap-6 rounded border border-border bg-white px-4 py-2">
      {items.map((kpi) => (
        <div key={kpi.label} className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {kpi.label}
          </span>
          <span className="font-mono text-sm font-medium tabular-nums text-foreground">
            {kpi.value != null ? `${kpi.value}${kpi.suffix ?? ""}` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
