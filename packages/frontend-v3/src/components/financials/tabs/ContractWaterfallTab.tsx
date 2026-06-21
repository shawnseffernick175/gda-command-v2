"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import {
  useContractWaterfall,
  useCreateTaskOrder,
} from "@/hooks/use-financial-bible";
import { formatMoney } from "@/lib/format-money";
import type { TaskOrderRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

function barPos(
  leftPct: number,
  widthPct: number,
  fill: string,
): CSSProperties {
  return {
    left: `${leftPct}%`,
    width: `${Math.max(widthPct, 0.5)}%`,
    "--gf": fill,
  } as CSSProperties;
}

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
  const [addFormOpen, setAddFormOpen] = useState(false);

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
      <WaterfallEmptyState
        onAddTaskOrder={() => setAddFormOpen(true)}
        addFormOpen={addFormOpen}
        onCloseAddForm={() => setAddFormOpen(false)}
      />
    );
  }

  const withDates = data.task_orders.filter((t) => t.pop_start && t.pop_end);
  const missingDates = data.task_orders.filter(
    (t) => !t.pop_start || !t.pop_end,
  );

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
        onAddTaskOrder={() => setAddFormOpen(true)}
      />

      <FundedSummaryStrip taskOrders={data.task_orders} />

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

      {addFormOpen && (
        <AddTaskOrderDrawer onClose={() => setAddFormOpen(false)} />
      )}
    </div>
  );
}

/* ── Empty State ──────────────────────────────────── */

function WaterfallEmptyState({
  onAddTaskOrder,
  addFormOpen,
  onCloseAddForm,
}: {
  onAddTaskOrder: () => void;
  addFormOpen: boolean;
  onCloseAddForm: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded border border-dashed border-border bg-card p-12 text-center">
        <p className="text-[15px] font-medium text-foreground">
          No task orders on file
        </p>
        <p className="mt-2 max-w-lg mx-auto text-[12px] text-muted-foreground leading-relaxed">
          The Contract Waterfall displays funded dollars flowing through awarded
          Task Orders. Upload a contract document to the Vault, or add task
          orders manually to populate this view.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            className="rounded border border-border bg-card px-4 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-gda-bg-deep"
            onClick={onAddTaskOrder}
          >
            Add task order
          </button>
          <a
            href="/vault"
            className="rounded bg-fin-teal px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:opacity-90"
          >
            Upload to Vault
          </a>
        </div>
      </div>
      {addFormOpen && <AddTaskOrderDrawer onClose={onCloseAddForm} />}
    </div>
  );
}

/* ── Funded Summary Strip ─────────────────────────── */

function FundedSummaryStrip({ taskOrders }: { taskOrders: TaskOrderRow[] }) {
  const stats = useMemo(() => {
    let totalFunded = 0;
    let totalCeiling = 0;
    let fundedCount = 0;
    let activeCount = 0;

    for (const to of taskOrders) {
      if (to.funded_to_date) {
        totalFunded += to.funded_to_date;
        fundedCount++;
      }
      if (to.ceiling) totalCeiling += to.ceiling;
      if (to.status === "active") activeCount++;
    }

    return {
      totalFunded,
      totalCeiling,
      fundedCount,
      activeCount,
      totalCount: taskOrders.length,
      burnPct:
        totalCeiling > 0
          ? Math.round((totalFunded / totalCeiling) * 100)
          : null,
    };
  }, [taskOrders]);

  return (
    <div className="flex flex-wrap items-center gap-6 rounded border border-border bg-card px-4 py-2">
      <KpiItem label="Total funded" value={formatMoney(stats.totalFunded)} />
      <KpiItem label="Total ceiling" value={formatMoney(stats.totalCeiling)} />
      {stats.burnPct !== null && (
        <KpiItem label="Burn rate" value={`${stats.burnPct}%`} />
      )}
      <KpiItem label="Active TOs" value={String(stats.activeCount)} />
      <KpiItem label="Total TOs" value={String(stats.totalCount)} />
    </div>
  );
}

function KpiItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
        {label}
      </span>
      <span className="text-[13px] font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

/* ── Filters ──────────────────────────────────────── */

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
  onAddTaskOrder,
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
  onAddTaskOrder: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Date range */}
      <FilterGroup label="From">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground"
        />
      </FilterGroup>
      <FilterGroup label="To">
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground"
        />
      </FilterGroup>

      {/* Vehicle multi-select dropdown */}
      {availableVehicles.length > 0 && (
        <FilterGroup label="Vehicle">
          <VehicleDropdown
            vehicles={availableVehicles}
            selected={vehicleFilter}
            onChange={setVehicleFilter}
          />
        </FilterGroup>
      )}

      {/* Status */}
      <FilterGroup label="Status">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="closeout">Closeout</option>
          <option value="expired">Expired</option>
          <option value="awarded_not_started">Awarded (not started)</option>
        </select>
      </FilterGroup>

      {/* Prime vs Sub */}
      <FilterGroup label="Role">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          className="rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground"
        >
          <option value="">Prime & Sub</option>
          <option value="PRIME">Prime only</option>
          <option value="SUB">Sub only</option>
        </select>
      </FilterGroup>

      <div className="ml-auto">
        <button
          type="button"
          className="rounded border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-gda-bg-deep"
          onClick={onAddTaskOrder}
        >
          + Add TO
        </button>
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </span>
      {children}
    </div>
  );
}

/* ── Vehicle Multi-Select Dropdown ────────────────── */

function VehicleDropdown({
  vehicles,
  selected,
  onChange,
}: {
  vehicles: { id: number; short_name: string }[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback(
    (id: number) => {
      if (selected.includes(id)) {
        onChange(selected.filter((v) => v !== id));
      } else {
        onChange([...selected, id]);
      }
    },
    [selected, onChange],
  );

  const label =
    selected.length === 0
      ? "All vehicles"
      : selected.length === 1
        ? vehicles.find((v) => v.id === selected[0])?.short_name ?? "1 selected"
        : `${selected.length} selected`;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground"
        onClick={() => setOpen(!open)}
        onBlur={(e) => {
          if (!wrapperRef.current?.contains(e.relatedTarget as Node)) {
            setOpen(false);
          }
        }}
      >
        <span>{label}</span>
        <span className="text-muted-foreground text-[11px]">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 min-w-[180px] rounded border border-border bg-card shadow-md">
          {selected.length > 0 && (
            <button
              type="button"
              className="w-full border-b border-border px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-gda-bg-deep"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange([]);
              }}
            >
              Clear all
            </button>
          )}
          <div className="max-h-[200px] overflow-y-auto py-1">
            {vehicles.map((v) => {
              const checked = selected.includes(v.id);
              return (
                <label
                  key={v.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1 text-[12px] text-foreground hover:bg-gda-bg-deep"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggle(v.id)}
                    className="h-3 w-3 rounded border-border"
                  />
                  {v.short_name}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Legend ────────────────────────────────────────── */

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
        const swatch = { "--gf": hue } as React.CSSProperties;
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

/* ── Gantt Chart ──────────────────────────────────── */

function GanttChart({
  taskOrders,
  today,
  onSelect,
}: {
  taskOrders: TaskOrderRow[];
  today: string;
  onSelect: (to: TaskOrderRow) => void;
}) {
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

  const groups = useMemo(() => {
    const map = new Map<string, TaskOrderRow[]>();
    for (const t of taskOrders) {
      const groupKey = t.parent_vehicle_short_name ?? "Standalone / Non-IDIQ";
      const existing = map.get(groupKey) ?? [];
      existing.push(t);
      map.set(groupKey, existing);
    }
    return Array.from(map.entries());
  }, [taskOrders]);

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
            <div className="flex items-center gap-2 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                ── {groupName} ──
              </span>
            </div>

            {tos.map((to) => {
              const startMs = new Date(to.pop_start!).getTime();
              const endMs = new Date(to.pop_end!).getTime();
              const leftPct =
                ((startMs - rangeStart) / (rangeEnd - rangeStart)) * 100;
              const widthPct =
                ((endMs - startMs) / (rangeEnd - rangeStart)) * 100;

              const isSub = to.prime_or_sub === "SUB";
              const fundedLabel = to.funded_to_date
                ? formatMoney(to.funded_to_date)
                : to.ceiling
                  ? formatMoney(to.ceiling)
                  : "";
              const barLabel = `${to.to_name}${fundedLabel ? ` — ${fundedLabel}` : ""}`;

              return (
                <div
                  key={to.id}
                  className="group relative h-7 my-1 cursor-pointer"
                  onClick={() => onSelect(to)}
                >
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

/* ── Missing Dates Section ────────────────────────── */

function MissingDatesSection({ taskOrders }: { taskOrders: TaskOrderRow[] }) {
  return (
    <div className="rounded border border-dashed border-border bg-card p-4">
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Missing dates — needs Vault parse
      </h3>
      <div className="space-y-1">
        {taskOrders.map((to) => {
          const dot = { "--gf": to.parent_color } as CSSProperties;
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
              {to.funded_to_date && (
                <span className="tabular-nums text-fin-teal font-medium">
                  {formatMoney(to.funded_to_date)} funded
                </span>
              )}
              {to.ceiling && (
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(to.ceiling)} ceiling
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Task Order Detail Drawer ─────────────────────── */

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

        <div className="flex items-center gap-2">
          <StatusBadge status={to.status} isExpiringSoon={to.is_expiring_soon} />
          {to.prime_or_sub === "SUB" && (
            <span className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              SUB
            </span>
          )}
        </div>

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

          <dt className="text-muted-foreground">Funded to Date</dt>
          <dd className="text-foreground tabular-nums font-medium text-fin-teal">
            {formatMoney(to.funded_to_date)}
          </dd>

          <dt className="text-muted-foreground">Ceiling</dt>
          <dd className="text-foreground tabular-nums">
            {formatMoney(to.ceiling)}
          </dd>

          <dt className="text-muted-foreground">CPARS Status</dt>
          <dd className="text-foreground">
            {to.cpars_status ?? "—"}
          </dd>
        </dl>

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

/* ── Add Task Order Drawer ────────────────────────── */

function AddTaskOrderDrawer({ onClose }: { onClose: () => void }) {
  const createTO = useCreateTaskOrder();
  const [form, setForm] = useState({
    to_name: "",
    to_number: "",
    prime_or_sub: "PRIME" as "PRIME" | "SUB",
    customer_agency: "",
    contracting_office: "",
    pop_start: "",
    pop_end: "",
    total_ceiling: "",
    funded_to_date: "",
    status: "active",
    notes: "",
  });

  const handleSubmit = () => {
    if (!form.to_name || !form.to_number) return;

    createTO.mutate(
      {
        to_name: form.to_name,
        to_number: form.to_number,
        prime_or_sub: form.prime_or_sub,
        customer_agency: form.customer_agency || null,
        contracting_office: form.contracting_office || null,
        pop_start: form.pop_start || null,
        pop_end: form.pop_end || null,
        total_ceiling: form.total_ceiling
          ? Number(form.total_ceiling)
          : null,
        funded_to_date: form.funded_to_date
          ? Number(form.funded_to_date)
          : null,
        status: form.status,
        notes: form.notes || null,
      },
      {
        onSuccess: () => onClose(),
      },
    );
  };

  const setField = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[420px] max-w-full bg-card border-l border-border shadow-lg overflow-y-auto">
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">
            Add Task Order
          </h2>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-[18px] leading-none"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <FormField
            label="Task Order Name *"
            value={form.to_name}
            onChange={(v) => setField("to_name", v)}
            placeholder="e.g. PEO IEW&S HQ SETA"
          />
          <FormField
            label="Contract Number *"
            value={form.to_number}
            onChange={(v) => setField("to_number", v)}
            placeholder="e.g. W56KGY22F0028"
          />

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                Role
              </label>
              <select
                value={form.prime_or_sub}
                onChange={(e) =>
                  setField("prime_or_sub", e.target.value)
                }
                className="w-full rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground"
              >
                <option value="PRIME">Prime</option>
                <option value="SUB">Sub</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => setField("status", e.target.value)}
                className="w-full rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground"
              >
                <option value="active">Active</option>
                <option value="awarded_not_started">Awarded (not started)</option>
                <option value="closeout">Closeout</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>

          <FormField
            label="Customer Agency"
            value={form.customer_agency}
            onChange={(v) => setField("customer_agency", v)}
            placeholder="e.g. U.S. Army DEVCOM"
          />
          <FormField
            label="Contracting Office"
            value={form.contracting_office}
            onChange={(v) => setField("contracting_office", v)}
            placeholder="e.g. ACC-APG"
          />

          <div className="flex gap-3">
            <FormField
              label="PoP Start"
              value={form.pop_start}
              onChange={(v) => setField("pop_start", v)}
              type="date"
            />
            <FormField
              label="PoP End"
              value={form.pop_end}
              onChange={(v) => setField("pop_end", v)}
              type="date"
            />
          </div>

          <div className="flex gap-3">
            <FormField
              label="Total Ceiling ($)"
              value={form.total_ceiling}
              onChange={(v) => setField("total_ceiling", v)}
              type="number"
              placeholder="0"
            />
            <FormField
              label="Funded to Date ($)"
              value={form.funded_to_date}
              onChange={(v) => setField("funded_to_date", v)}
              type="number"
              placeholder="0"
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
              className="w-full rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground resize-none"
              placeholder="Source reference, context..."
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <button
            type="button"
            className="rounded bg-fin-teal px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            onClick={handleSubmit}
            disabled={!form.to_name || !form.to_number || createTO.isPending}
          >
            {createTO.isPending ? "Saving…" : "Save task order"}
          </button>
          <button
            type="button"
            className="rounded border border-border bg-card px-4 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-gda-bg-deep"
            onClick={onClose}
          >
            Cancel
          </button>
          {createTO.isError && (
            <span className="text-[11px] text-fin-plum">
              Failed to save. Try again.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Form helpers ─────────────────────────────────── */

function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex-1">
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground"
      />
    </div>
  );
}

/* ── Status Badge ─────────────────────────────────── */

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
