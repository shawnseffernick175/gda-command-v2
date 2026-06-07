"use client";

import Link from "next/link";
import { useVehicles } from "@/hooks/use-vehicles";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";

export default function VehiclesPage() {
  const { data: vehicles, isLoading, error, refetch } = useVehicles();

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-lg font-bold text-foreground">
        Contract Vehicles
      </h1>

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
                <th className="px-3 py-2 text-left font-medium">Vehicle</th>
                <th className="px-3 py-2 text-left font-medium w-[80px]">Type</th>
                <th className="px-3 py-2 text-left font-medium w-[100px]">Agency</th>
                <th className="px-3 py-2 text-left font-medium w-[160px]">Contract #</th>
                <th className="px-3 py-2 text-left font-medium w-[120px]">Open Opps</th>
                <th className="px-3 py-2 text-left font-medium w-[100px]">Pipeline</th>
              </tr>
            </thead>
            <tbody>
              {vehicles && vehicles.length > 0 ? (
                vehicles.map((v) => (
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
