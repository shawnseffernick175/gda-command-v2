"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useVehicles } from "@/hooks/use-vehicles";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";

const VEHICLE_SORT_COLS: ColumnSortConfig[] = [
  { field: "vehicle", type: "string", accessor: (r) => r.short_name },
  { field: "type", type: "string", accessor: (r) => r.vehicle_type },
  { field: "agency", type: "string" },
  { field: "contract_number", type: "string" },
  { field: "open_opps", type: "number", accessor: (r) => r.opportunity_count },
  { field: "pipeline", type: "number", accessor: (r) => r.pipeline_count },
];

export default function VehiclesPage() {
  return (
    <Suspense fallback={<div />}>
      <VehiclesContent />
    </Suspense>
  );
}

function VehiclesContent() {
  const { data: vehicles, isLoading, error, refetch } = useVehicles();
  const { sortBy, sortDir, handleSort } = useTableSort();

  const sorted = useMemo(() => {
    if (!vehicles) return [];
    if (!sortBy) return vehicles;
    return sortData(vehicles as unknown as Record<string, unknown>[], sortBy, sortDir, VEHICLE_SORT_COLS) as unknown as typeof vehicles;
  }, [vehicles, sortBy, sortDir]);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 sticky-page-header">
        <h1 className="font-mono text-lg font-bold text-foreground">
          Contract Vehicles
        </h1>
      </div>

      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 bg-gda-panel" />
          ))}
        </div>
      ) : (
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                <SortableHeader label="Vehicle" field="vehicle" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Type" field="type" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="80px" />
                <SortableHeader label="Agency" field="agency" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="100px" />
                <SortableHeader label="Contract #" field="contract_number" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="160px" />
                <SortableHeader label="Open Opps" field="open_opps" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="120px" />
                <SortableHeader label="Pipeline" field="pipeline" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="100px" />
              </tr>
            </thead>
            <tbody>
              {sorted && sorted.length > 0 ? (
                sorted.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-border hover:bg-gda-panel/50 transition-colors"
                  >
                    <td className="px-3 py-2">
                      <div>
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {v.short_name}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {v.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                      {v.vehicle_type}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                      {v.agency ?? "---"}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                      {v.contract_number ?? "---"}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/opportunities?groupBy=vehicle`}
                        className="text-xs font-mono text-gda-green hover:underline"
                      >
                        {v.opportunity_count}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                      {v.pipeline_count > 0 ? (
                        <span className="text-gda-green">{v.pipeline_count}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No vehicles configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
