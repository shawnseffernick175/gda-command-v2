"use client";

import type { FeedFilters, VehicleScorecard } from "@/hooks/use-idiq-ops";
import { cn } from "@/lib/utils";

interface FilterRailProps {
  filters: FeedFilters;
  onChange: (filters: FeedFilters) => void;
  vehicles: VehicleScorecard[];
}

export function FilterRail({ filters, onChange, vehicles }: FilterRailProps) {
  return (
    <aside className="w-[200px] shrink-0 space-y-4 border-r border-border pr-4">
      <div>
        <label className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium">
          Vehicle
        </label>
        <select
          className="mt-1 w-full rounded border border-border bg-white px-2 py-1 text-xs text-foreground"
          value={filters.vehicle_id ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              vehicle_id: e.target.value ? Number(e.target.value) : undefined,
              page: 1,
            })
          }
        >
          <option value="">All vehicles</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.short_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium">
          Eligibility
        </label>
        <div className="mt-1 space-y-1">
          {(["", "eligible", "not_eligible", "unclear"] as const).map((val) => (
            <button
              key={val}
              type="button"
              className={cn(
                "block w-full rounded px-2 py-1 text-left text-xs transition-colors",
                filters.eligibility === (val || undefined)
                  ? "bg-gda-green/10 text-gda-green font-medium"
                  : "text-foreground hover:bg-gda-panel",
              )}
              onClick={() =>
                onChange({
                  ...filters,
                  eligibility: val || undefined,
                  page: 1,
                })
              }
            >
              {val === "" ? "All" : val === "eligible" ? "Eligible" : val === "not_eligible" ? "Not eligible" : "Unclear"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium">
          Status
        </label>
        <div className="mt-1 space-y-1">
          {(["open", "closed", "awarded", "cancelled"] as const).map((val) => (
            <button
              key={val}
              type="button"
              className={cn(
                "block w-full rounded px-2 py-1 text-left text-xs capitalize transition-colors",
                filters.status === val
                  ? "bg-gda-green/10 text-gda-green font-medium"
                  : "text-foreground hover:bg-gda-panel",
              )}
              onClick={() =>
                onChange({ ...filters, status: val, page: 1 })
              }
            >
              {val}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium">
          Heat
        </label>
        <div className="mt-1 space-y-1">
          {(["", "hot", "eligible", "watch", "not_eligible"] as const).map(
            (val) => (
              <button
                key={val}
                type="button"
                className={cn(
                  "block w-full rounded px-2 py-1 text-left text-xs transition-colors",
                  filters.heat === (val || undefined)
                    ? "bg-gda-green/10 text-gda-green font-medium"
                    : "text-foreground hover:bg-gda-panel",
                )}
                onClick={() =>
                  onChange({ ...filters, heat: val || undefined, page: 1 })
                }
              >
                {val === ""
                  ? "All"
                  : val === "hot"
                    ? "Hot"
                    : val === "eligible"
                      ? "Eligible"
                      : val === "watch"
                        ? "Watch"
                        : "Not eligible"}
              </button>
            ),
          )}
        </div>
      </div>

      <div>
        <label className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium">
          Closing window
        </label>
        <div className="mt-1 space-y-1">
          {([
            { label: "Any", value: undefined },
            { label: "≤ 3 days", value: 3 },
            { label: "≤ 7 days", value: 7 },
            { label: "≤ 14 days", value: 14 },
            { label: "≤ 30 days", value: 30 },
          ] as const).map((opt) => (
            <button
              key={opt.label}
              type="button"
              className={cn(
                "block w-full rounded px-2 py-1 text-left text-xs transition-colors",
                filters.closing_within_days === opt.value
                  ? "bg-gda-green/10 text-gda-green font-medium"
                  : "text-foreground hover:bg-gda-panel",
              )}
              onClick={() =>
                onChange({
                  ...filters,
                  closing_within_days: opt.value,
                  page: 1,
                })
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium">
          Agency
        </label>
        <input
          type="text"
          placeholder="Filter by agency..."
          className="mt-1 w-full rounded border border-border bg-white px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
          value={filters.agency ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              agency: e.target.value || undefined,
              page: 1,
            })
          }
        />
      </div>
    </aside>
  );
}
