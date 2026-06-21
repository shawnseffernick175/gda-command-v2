"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  useIdiqOpsFeed,
  useIdiqOpsScoreboard,
  useIdiqOpsKpis,
} from "@/hooks/use-idiq-ops";
import type { FeedFilters } from "@/hooks/use-idiq-ops";
import { Skeleton } from "@/components/ui/skeleton";

const TaskOrderFeed = dynamic(
  () =>
    import("@/components/idiq-ops/TaskOrderFeed").then((m) => m.TaskOrderFeed),
  { ssr: false, loading: () => <FeedSkeleton /> },
);

const FilterRail = dynamic(
  () => import("@/components/idiq-ops/FilterRail").then((m) => m.FilterRail),
  { ssr: false },
);

const VehicleScoreboard = dynamic(
  () =>
    import("@/components/idiq-ops/VehicleScoreboard").then(
      (m) => m.VehicleScoreboard,
    ),
  { ssr: false, loading: () => <ScoreboardSkeleton /> },
);

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
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 sticky-page-header">
        <div className="flex items-baseline gap-3">
          <h1 className="shrink-0 text-lg font-semibold text-foreground">
            IDIQ Operations
          </h1>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Tracks the task orders flowing through the IDIQ vehicles you hold or
            can compete on — review the live feed, filter by vehicle and
            eligibility, and use the scoreboard to see where you are best
            positioned to win work.
          </p>
        </div>
      </div>

      <KpiStrip kpis={kpis} />

      {!feedLoading && !scoreboardLoading && (feedData?.total ?? 0) === 0 && (scoreboard ?? []).length === 0 ? (
        <div className="rounded border border-border bg-gda-panel px-8 py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            No task orders ingested yet
          </p>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground">
            IDIQ Ops monitors live task orders flowing through the contract
            vehicles Envision holds or can compete on (RS3, OASIS+, SeaPort-NxG,
            etc.). Task orders appear here once the vehicle polling sources are
            configured and have run their first ingest cycle. IDIQ pursuits
            themselves live on the capture pipeline board — you must win the
            IDIQ seat before competing for the task orders tracked here.
          </p>
        </div>
      ) : (
        <div className="flex gap-4">
          <FilterRail
            filters={filters}
            onChange={setFilters}
            vehicles={scoreboard ?? []}
          />

          {feedLoading ? (
            <FeedSkeleton />
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
            <ScoreboardSkeleton />
          ) : (
            <VehicleScoreboard
              vehicles={scoreboard ?? []}
              selectedVehicleId={filters.vehicle_id}
              onSelect={handleVehicleSelect}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Skeletons ────────────────────────────────────────────────── */

function FeedSkeleton() {
  return (
    <div className="flex-1 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-8 bg-gda-panel" />
      ))}
    </div>
  );
}

function ScoreboardSkeleton() {
  return (
    <div className="w-[260px] shrink-0 space-y-2 border-l border-border pl-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 bg-gda-panel" />
      ))}
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
    <div className="flex items-center gap-6 rounded border border-border bg-gda-panel px-4 py-2">
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
