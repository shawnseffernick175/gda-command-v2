"use client";

import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import Link from "next/link";
import {
  useVehicles,
  useReingestAllVehicles,
} from "@/hooks/use-vehicles";
import type { VehicleSummary } from "@/hooks/use-vehicles";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { ScoreTooltip } from "@/components/shared/score-tooltip";
import { cn } from "@/lib/utils";

const VehicleDetailPanel = lazy(() => import("./vehicle-detail-panel"));

/* ── Helpers ───────────────────────────────────────────────── */

function formatCurrency(val: number | null): string {
  if (val == null) return "---";
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "---";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

type SortField =
  | "name"
  | "contract_number"
  | "sponsor"
  | "prime_sub"
  | "ceiling"
  | "expires"
  | "status"
  | "set_aside"
  | "confidence";
type SortDir = "asc" | "desc";

function compareValues(
  a: VehicleSummary,
  b: VehicleSummary,
  field: SortField,
  dir: SortDir,
): number {
  const mul = dir === "asc" ? 1 : -1;
  const av = getSortValue(a, field);
  const bv = getSortValue(b, field);
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === "string" && typeof bv === "string")
    return av.localeCompare(bv) * mul;
  if (typeof av === "number" && typeof bv === "number")
    return (av - bv) * mul;
  return 0;
}

function getSortValue(
  v: VehicleSummary,
  field: SortField,
): string | number | null {
  switch (field) {
    case "name":
      return v.name;
    case "contract_number":
      return v.contract_number;
    case "sponsor":
      return v.sponsor_agency ?? v.agency;
    case "prime_sub":
      return v.prime_or_sub;
    case "ceiling":
      return v.ceiling_value;
    case "expires":
      return v.expiration_date;
    case "status":
      return v.status;
    case "set_aside":
      return v.set_aside_type;
    case "confidence":
      return v.extraction_confidence;
    default:
      return null;
  }
}

/* ── Page ──────────────────────────────────────────────────── */

export default function VehiclesPage() {
  const { data: vehicles, isLoading, error, refetch } = useVehicles();
  const reingest = useReingestAllVehicles();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortBy === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(field);
        setSortDir("asc");
      }
    },
    [sortBy],
  );

  const sorted = useMemo(() => {
    if (!vehicles) return [];
    return [...vehicles].sort((a, b) => compareValues(a, b, sortBy, sortDir));
  }, [vehicles, sortBy, sortDir]);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 sticky-page-header">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="shrink-0 text-section font-semibold text-foreground">
              Contract Vehicles
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              The contract vehicles (GWACs, IDIQs, schedules, BPAs) you hold or can access — scope, ceiling, and positioning.
            </p>
          </div>
          <button
            type="button"
            className="h-8 rounded border border-border bg-gda-panel px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-gda-bg-base"
            onClick={() => reingest.mutate(true)}
            disabled={reingest.isPending}
          >
            {reingest.isPending ? "Re-ingesting..." : "Re-ingest All"}
          </button>
        </div>
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
        <div className="flex gap-4">
          {/* Table */}
          <div className="flex-1 min-w-0 rounded border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground uppercase tracking-wider">
                  <SortableHeader
                    label="Vehicle"
                    field="name"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Contract #"
                    field="contract_number"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                    width="140px"
                  />
                  <SortableHeader
                    label="Sponsor"
                    field="sponsor"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                    width="100px"
                  />
                  <SortableHeader
                    label="Prime/Sub"
                    field="prime_sub"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                    width="80px"
                  />
                  <SortableHeader
                    label="Ceiling"
                    field="ceiling"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                    width="90px"
                    align="right"
                  />
                  <SortableHeader
                    label="Expires"
                    field="expires"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                    width="100px"
                  />
                  <SortableHeader
                    label="Set-Aside"
                    field="set_aside"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                    width="90px"
                  />
                  <SortableHeader
                    label="Status"
                    field="status"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                    width="80px"
                  />
                  <th className="px-3 py-2 text-left font-medium w-[60px]">
                    Opps
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.length > 0 ? (
                  sorted.map((v) => (
                    <tr
                      key={v.id}
                      className={cn(
                        "border-b border-border cursor-pointer transition-colors",
                        selectedId === v.id
                          ? "bg-gda-panel"
                          : "hover:bg-gda-bg-base",
                      )}
                      onClick={() =>
                        setSelectedId(selectedId === v.id ? null : v.id)
                      }
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {v.short_name}
                          </span>
                          {v.needs_review && (
                            <span className="inline-flex items-center rounded border border-amber-400/50 bg-amber-400/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600">
                              Needs Review
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {v.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground tabular-nums">
                        {v.contract_number ?? "---"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {v.sponsor_agency ?? v.agency ?? "---"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground capitalize">
                        {v.prime_or_sub ?? "---"}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground text-right tabular-nums">
                        {formatCurrency(v.ceiling_value)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                        {formatDate(v.expiration_date)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {v.set_aside_type ?? "---"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={v.status} expiration={v.expiration_date} />
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href="/opportunities"
                          className="text-xs font-mono text-gda-green hover:underline"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          title="View opportunities"
                        >
                          {v.opportunity_count}
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No vehicles configured. Upload contract docs to the Vault
                      to auto-populate.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Detail panel (lazy-loaded) */}
          {selectedId && (
            <Suspense
              fallback={
                <div className="w-[380px] shrink-0 rounded border border-border bg-gda-panel p-4 space-y-3">
                  <Skeleton className="h-6 w-48 bg-gda-panel" />
                  <Skeleton className="h-4 w-32 bg-gda-panel" />
                  <Skeleton className="h-20 bg-gda-panel" />
                </div>
              }
            >
              <VehicleDetailPanel
                vehicleId={selectedId}
                onClose={() => setSelectedId(null)}
              />
            </Suspense>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Status badge with ? popover ────────────────────────────── */

function StatusBadge({
  status,
  expiration,
}: {
  status: string | null;
  expiration: string | null;
}) {
  if (!status) return <span className="text-xs text-muted-foreground">---</span>;

  const isActive = status === "active";
  const isExpired = status === "expired";

  return (
    <ScoreTooltip
      label="Status"
      explanation="Active if today is before Expires; Expired otherwise. Pending if no expiration date is available."
      score={status}
    >
      <span
        className={cn(
          "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold",
          isActive && "border border-gda-green/30 text-gda-green bg-gda-green/10",
          isExpired && "bg-critical text-white",
          !isActive && !isExpired && "border border-border text-muted-foreground",
        )}
      >
        {status.toUpperCase()}
        {isExpired && expiration && (
          <span className="ml-1">{formatDate(expiration)}</span>
        )}
      </span>
    </ScoreTooltip>
  );
}

/* ── Sortable header ────────────────────────────────────────── */

function SortableHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  width,
  align = "left",
}: {
  label: string;
  field: SortField;
  sortBy: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  width?: string;
  align?: "left" | "right";
}) {
  const active = sortBy === field;
  const caret = active ? (sortDir === "asc" ? "^" : "v") : "";

  return (
    <th
      className={cn(
        "px-3 py-2 font-medium bg-gda-bg-base",
        align === "right" ? "text-right" : "text-left",
      )}
      style={width ? { width } : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "flex items-center gap-1 transition-colors hover:text-foreground",
          active ? "text-gda-green" : "text-muted-foreground",
          align === "right" && "ml-auto",
        )}
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        {caret && <span className="font-mono text-[11px]">{caret}</span>}
      </button>
    </th>
  );
}


