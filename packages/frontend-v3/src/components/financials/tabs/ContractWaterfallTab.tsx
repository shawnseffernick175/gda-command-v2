"use client";

import { useState, useMemo } from "react";
import { useContractWaterfall } from "@/hooks/use-financial-bible";
import { formatMoney } from "@/lib/format-money";
import type { TaskOrderRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

/** Build a position+fill style object for a Gantt bar (avoids inline color keywords) */
function barPos(leftPct: number, widthPct: number, fill: string): CSSProperties {
  return { left: `${leftPct}%`, width: `${Math.max(widthPct, 0.5)}%`, '--gf': fill } as CSSProperties;
}

/** Default range: today - 12mo to today + 60mo */
function defaultFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 12);
  return d.toISOString().slice(0, 10);
}
function defaultTo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 60);
  return d.toISOString().slice(0, 10);
}

type StatusFilter = "" | "active" | "closeout" | "expired" | "awarded_not_started";
type RoleFilter = "" | "PRIME" | "SUB";

export function ContractWaterfallTab() {
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [vehicleFilter, setVehicleFilter] = useState<number[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("");
  const [selectedTO, setSelectedTO] = useState<TaskOrderRow | null>(null);

  const params = useMemo(
    () => ({
      from: fromDate,
      to: toDate,
      status: statusFilter || undefined,
      prime_or_sub: roleFilter || undefined,
    }),
    [fromDate, toDate, statusFilter, roleFilter],
  );

  const { data, isLoading, error } = useContractWaterfall(params);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading task orders…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-fin-plum">
        Failed to load task orders: {error.message}
      </div>
    );
  }

  if (!data || data.task_orders.length === 0) {
    return (
      <div className="rounded border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No task orders on file yet. Add task orders by uploading award docs to
          the Vault, or import from USAspending via the Recompete Tracker.
        </p>
      </div>
    );
  }

  // Separate: TOs with dates vs without
  const withDates = data.task_orders.filter((t) => t.pop_start && t.pop_end);
  const missingDates = data.task_orders.filter(
    (t) => !t.pop_start || !t.pop_end,
  );

  // Apply vehicle filter client-side (multi-select)
  const filtered =
    vehicleFilter.length > 0
      ? withDates.filter(
          (t) =>
            t.parent_vehicle_id !== null &&
            vehicleFilter.includes(t.parent_vehicle_id),
        )
      : withDates;

  return (
    <div className="space-y-4">
      <WaterfallFilters
        availableVehicles={data.available_vehicles}
        vehicleFilter={vehicleFilter}
        setVehicleFilter={setVehicleFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
      />

      <WaterfallLegend taskOrders={data.task_orders} />

      {filtered.length > 0 && (
        <GanttChart
          taskOrders={filtered}
          today={data.today}
          onSelect={setSelectedTO}
        />
      )}

      {missingDates.length > 0 && (
        <MissingDatesSection taskOrders={missingDates} />
      )}

      {selectedTO && (
        <TaskOrderDrawer to={selectedTO} onClose={() => setSelectedTO(null)} />
      )}
    </div>
  );
}

/* ─── Filters ─────────────────────────────────────── */

function WaterfallFilters({
  availableVehicles,
  vehicleFilter,
  setVehicleFilter,
  statusFilter,
  setStatusFilter,
  roleFilter,
  setRoleFilter,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
}: {
  availableVehicles: { id: number; short_name: string }[];
  vehicleFilter: number[];
  setVehicleFilter: (v: number[]) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  roleFilter: RoleFilter;
  setRoleFilter: (v: RoleFilter) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Date range */}
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        From
      </label>
      <input
        type="date"
        value={fromDate}
        onChange={(e) => setFromDate(e.target.value)}
        className="rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground"
      />
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        To
      </label>
      <input
        type="date"
        value={toDate}
        onChange={(e) => setToDate(e.target.value)}
        className="rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground"
      />

      {/* Parent IDIQ multi-select */}
      <select
        multiple
        value={vehicleFilter.map(String)}
        onChange={(e) =>
          setVehicleFilter(
            Array.from(e.target.selectedOptions, (o) => Number(o.value)),
          )
        }
        className="rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground max-h-[80px]"
      >
        {availableVehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.short_name}
          </option>
        ))}
      </select>

      {/* Status */}
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        className="rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground"
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="closeout">Closeout</option>
        <option value="expired">Expired</option>
        <option value="awarded_not_started">Awarded (not started)</option>
      </select>

      {/* Prime vs Sub */}
      <select
        value={roleFilter}
        onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
        className="rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground"
      >
        <option value="">Prime & Sub</option>
        <option value="PRIME">Prime only</option>
        <option value="SUB">Sub only</option>
      </select>
    </div>
  );
}

/* ─── Legend ───────────────────────────────────────── */

function WaterfallLegend({ taskOrders }: { taskOrders: TaskOrderRow[] }) {
  const legend = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of taskOrders) {
      const name = t.parent_vehicle_short_name ?? "Non-IDIQ";
      if (!map.has(name)) map.set(name, t.parent_color);
    }
    return Array.from(map.entries());
  }, [taskOrders]);

  return (
    <div className="flex flex-wrap items-center gap-4">
      {legend.map(([name, hue]) => {
        const swatch = { '--gf': hue } as React.CSSProperties;
        return (
          <div key={name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-[2px] bg-[var(--gf)]"
              style={swatch}
            />
            <span className="text-[11px] text-muted-foreground">{name}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Gantt Chart (CSS-grid) ──────────────────────── */

function GanttChart({
  taskOrders,
  today,
  onSelect,
}: {
  taskOrders: TaskOrderRow[];
  today: string;
  onSelect: (to: TaskOrderRow) => void;
}) {
  // Compute timeline range
  const allStarts = taskOrders.map((t) => new Date(t.pop_start!).getTime());
  const allEnds = taskOrders.map((t) => new Date(t.pop_end!).getTime());
  const rangeStart = Math.min(...allStarts);
  const rangeEnd = Math.max(...allEnds);
  const totalDays = (rangeEnd - rangeStart) / (1000 * 60 * 60 * 24);

  const todayMs = new Date(today).getTime();
  const todayPct =
    totalDays > 0
      ? ((todayMs - rangeStart) / (rangeEnd - rangeStart)) * 100
      : 0;

  // Group by parent vehicle
  const groups = useMemo(() => {
    const map = new Map<string, TaskOrderRow[]>();
    for (const t of taskOrders) {
      const groupKey = t.parent_vehicle_short_name ?? "Commercial / Non-IDIQ";
      const existing = map.get(groupKey) ?? [];
      existing.push(t);
      map.set(groupKey, existing);
    }
    return Array.from(map.entries());
  }, [taskOrders]);

  // Generate year markers
  const yearMarkers = useMemo(() => {
    const startYear = new Date(rangeStart).getFullYear();
    const endYear = new Date(rangeEnd).getFullYear();
    const markers: { year: number; pct: number }[] = [];
    for (let y = startYear; y <= endYear; y++) {
      const yearMs = new Date(y, 0, 1).getTime();
      if (yearMs >= rangeStart && yearMs <= rangeEnd) {
        const pct = ((yearMs - rangeStart) / (rangeEnd - rangeStart)) * 100;
        markers.push({ year: y, pct });
      }
    }
    return markers;
  }, [rangeStart, rangeEnd]);

  const currentYear = new Date().getFullYear();

  return (
    <div className="rounded border border-border bg-card p-4 overflow-x-auto">
      {/* X-axis: year markers */}
      <div className="relative h-6 mb-1 border-b border-border/50">
        {yearMarkers.map((m) => (
          <span
            key={m.year}
            className={cn(
              "absolute text-[11px] tabular-nums -translate-x-1/2",
              m.year === currentYear
                ? "font-semibold text-foreground"
                : "text-muted-foreground",
            )}
            style={{ left: `${m.pct}%` }}
          >
            {m.year}
          </span>
        ))}
      </div>

      {/* Today line + gantt rows */}
      <div className="relative">
        {/* Today vertical line */}
        {todayPct > 0 && todayPct < 100 && (
          <div
            className="absolute top-0 bottom-0 w-px z-10 bg-fin-plum"
            style={{ left: `${todayPct}%` }}
          >
            <span className="absolute -top-5 -translate-x-1/2 text-[11px] text-fin-plum font-medium">
              Today
            </span>
          </div>
        )}

        {groups.map(([groupName, tos]) => (
          <div key={groupName} className="mb-3">
            {/* Section header */}
            <div className="flex items-center gap-2 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                ── {groupName} ──
              </span>
            </div>

            {/* Rows */}
            {tos.map((to) => {
              const startMs = new Date(to.pop_start!).getTime();
              const endMs = new Date(to.pop_end!).getTime();
              const leftPct =
                ((startMs - rangeStart) / (rangeEnd - rangeStart)) * 100;
              const widthPct =
                ((endMs - startMs) / (rangeEnd - rangeStart)) * 100;

              const isSub = to.prime_or_sub === "SUB";
              const barLabel = `${to.to_name}${to.ceiling ? ` — ${formatMoney(to.ceiling)}` : ""}`;

              return (
                <div
                  key={to.id}
                  className="group relative h-7 my-1 cursor-pointer"
                  onClick={() => onSelect(to)}
                >
                  {/* Bar */}
                  <div
                    className={cn(
                      "absolute top-0.5 h-6 rounded-[3px] flex items-center px-2 transition-opacity hover:opacity-90 bg-[var(--gf)]",
                      to.is_expiring_soon && "ring-2 ring-fin-plum",
                      isSub && "gantt-bar-hatched",
                    )}
                    style={barPos(leftPct, widthPct, to.parent_color)}
                    title={`${to.to_name}\nPoP: ${to.pop_start} → ${to.pop_end}\nCeiling: ${formatMoney(to.ceiling)}\nFunded: ${formatMoney(to.funded_to_date)}\nDays remaining: ${to.days_until_expiration ?? "N/A"}\nParent: ${to.parent_vehicle_short_name ?? "None"}`}
                  >
                    {widthPct > 8 && (
                      <span className="truncate text-[11px] font-medium text-white leading-none">
                        {barLabel}
                      </span>
                    )}
                  </div>

                  {/* Inline label for narrow bars */}
                  {widthPct <= 8 && (
                    <span
                      className="absolute top-1 text-[11px] text-muted-foreground truncate max-w-[120px]"
                      style={{ left: `${leftPct + widthPct + 0.5}%` }}
                    >
                      {to.to_name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Missing Dates Section ───────────────────────── */

function MissingDatesSection({ taskOrders }: { taskOrders: TaskOrderRow[] }) {
  return (
    <div className="rounded border border-dashed border-border bg-card p-4">
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Missing dates — needs Vault parse
      </h3>
      <div className="space-y-1">
        {taskOrders.map((to) => {
          const dot = { '--gf': to.parent_color } as CSSProperties;
          return (
          <div key={to.id} className="flex items-center gap-3 text-[12px]">
            <span
              className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[var(--gf)]"
              style={dot}
            />
            <span className="text-foreground font-medium">{to.to_name}</span>
            <span className="text-muted-foreground">
              {to.parent_vehicle_short_name ?? "Non-IDIQ"}
            </span>
            <span className="text-muted-foreground italic">
              {to.prime_or_sub}
            </span>
            {to.ceiling && (
              <span className="tabular-nums text-muted-foreground">
                {formatMoney(to.ceiling)}
              </span>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Task Order Detail Drawer ────────────────────── */

function TaskOrderDrawer({
  to,
  onClose,
}: {
  to: TaskOrderRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[400px] max-w-full bg-card border-l border-border shadow-lg overflow-y-auto">
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {to.to_name}
            </h2>
            <p className="text-[12px] text-muted-foreground tabular-nums">
              {to.to_number}
            </p>
          </div>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-[18px] leading-none"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <StatusBadge status={to.status} isExpiringSoon={to.is_expiring_soon} />
          {to.prime_or_sub === "SUB" && (
            <span className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              SUB
            </span>
          )}
        </div>

        {/* Details */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[12px]">
          <dt className="text-muted-foreground">Parent IDIQ</dt>
          <dd className="text-foreground font-medium">
            {to.parent_vehicle_short_name ?? "Standalone / Non-IDIQ"}
          </dd>

          <dt className="text-muted-foreground">Customer</dt>
          <dd className="text-foreground">
            {to.customer_agency ?? "—"}
          </dd>

          <dt className="text-muted-foreground">Contracting Office</dt>
          <dd className="text-foreground">
            {to.contracting_office ?? "—"}
          </dd>

          <dt className="text-muted-foreground">PoP Start</dt>
          <dd className="text-foreground tabular-nums">
            {to.pop_start ?? "TBD"}
          </dd>

          <dt className="text-muted-foreground">PoP End</dt>
          <dd className="text-foreground tabular-nums">
            {to.pop_end ?? "TBD"}
          </dd>

          <dt className="text-muted-foreground">Days Remaining</dt>
          <dd className="text-foreground tabular-nums">
            {to.days_until_expiration != null
              ? `${to.days_until_expiration} days`
              : "—"}
          </dd>

          <dt className="text-muted-foreground">Ceiling</dt>
          <dd className="text-foreground tabular-nums font-medium">
            {formatMoney(to.ceiling)}
          </dd>

          <dt className="text-muted-foreground">Funded to Date</dt>
          <dd className="text-foreground tabular-nums">
            {formatMoney(to.funded_to_date)}
          </dd>

          <dt className="text-muted-foreground">CPARS Status</dt>
          <dd className="text-foreground">
            {to.cpars_status ?? "—"}
          </dd>
        </dl>

        {/* Notes */}
        {to.notes && (
          <div className="border-t border-border pt-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
              Notes
            </p>
            <p className="text-[12px] text-foreground">{to.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Status Badge ────────────────────────────────── */

function StatusBadge({
  status,
  isExpiringSoon,
}: {
  status: string;
  isExpiringSoon: boolean;
}) {
  if (isExpiringSoon) {
    return (
      <span className="rounded px-2 py-0.5 text-[11px] font-semibold bg-fin-plum text-white">
        EXPIRING SOON
      </span>
    );
  }

  switch (status) {
    case "active":
      return (
        <span className="rounded border border-fin-teal px-2 py-0.5 text-[11px] font-medium text-fin-teal">
          Active
        </span>
      );
    case "awarded_not_started":
      return (
        <span className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Awarded — Not Started
        </span>
      );
    case "closeout":
      return (
        <span className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Closeout
        </span>
      );
    case "expired":
      return (
        <span className="rounded px-2 py-0.5 text-[11px] font-semibold bg-fin-plum text-white">
          Expired
        </span>
      );
    default:
      return null;
  }
}
