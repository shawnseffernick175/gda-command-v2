"use client";

import { cn } from "@/lib/utils";
import type { VehicleScorecard } from "@/hooks/use-idiq-ops";

interface VehicleScoreboardProps {
  vehicles: VehicleScorecard[];
  selectedVehicleId: number | undefined;
  onSelect: (vehicleId: number | undefined) => void;
}

export function VehicleScoreboard({
  vehicles,
  selectedVehicleId,
  onSelect,
}: VehicleScoreboardProps) {
  return (
    <aside className="w-[260px] shrink-0 space-y-2 overflow-y-auto border-l border-border pl-4">
      <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        Vehicle Scoreboard
      </h3>
      {vehicles.map((v) => (
        <button
          key={v.id}
          type="button"
          className={cn(
            "w-full rounded border p-3 text-left transition-colors",
            selectedVehicleId === v.id
              ? "border-gda-green bg-gda-green/5"
              : "border-border bg-white hover:bg-gda-panel/50",
          )}
          onClick={() =>
            onSelect(selectedVehicleId === v.id ? undefined : v.id)
          }
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              {v.short_name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {v.agency}
            </span>
          </div>

          {v.contract_number && (
            <p className="mt-0.5 text-[11px] text-muted-foreground font-mono">
              {v.contract_number}
              {v.ceiling_value
                ? ` · $${formatCeiling(v.ceiling_value)}`
                : ""}
            </p>
          )}

          <div className="mt-2 border-t border-border pt-2 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Open TOs:</span>
              <span className="font-mono tabular-nums text-foreground">
                {v.open_to_count}
                {v.eligible_count > 0 && (
                  <span className="text-gda-green ml-1">
                    ({v.eligible_count} eligible)
                  </span>
                )}
              </span>
            </div>

            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Last TO:</span>
              <span className="font-mono tabular-nums text-foreground">
                {v.last_to_posted ? formatDate(v.last_to_posted) : "—"}
              </span>
            </div>

            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Next close:</span>
              <span className="font-mono tabular-nums text-foreground">
                {v.next_close ? formatDate(v.next_close) : "—"}
              </span>
            </div>

            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Submitted YTD:</span>
              <span className="font-mono tabular-nums text-foreground">
                {v.submitted_ytd}
              </span>
            </div>

            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Won LTM:</span>
              <span className="font-mono tabular-nums text-foreground">
                {v.awarded_ltm}
              </span>
            </div>
          </div>

          <div className="mt-2 border-t border-border pt-1.5">
            <PollingStatus
              status={v.polling_status}
              source={v.polling_source}
              lastPolled={v.polling_last}
            />
          </div>
        </button>
      ))}
    </aside>
  );
}

function PollingStatus({
  status,
  source,
  lastPolled,
}: {
  status: string | null;
  source: string | null;
  lastPolled: string | null;
}) {
  if (!source) {
    return (
      <span className="text-[11px] text-muted-foreground italic">
        Manual ingest
      </span>
    );
  }

  const isOk = status === "success" || status === "manual";
  const isFailed = status === "failed" || status === "auth_required";
  const timeAgo = lastPolled ? getTimeAgo(lastPolled) : "never";

  return (
    <span
      className={cn(
        "text-[11px]",
        isFailed ? "text-red-600" : "text-muted-foreground",
      )}
    >
      Polling:{" "}
      {isFailed ? (
        <span className="font-medium">
          Failed {timeAgo}
          {status === "auth_required" && " — auth required"}
        </span>
      ) : (
        <span>
          {isOk ? "OK" : "—"} {source?.replace("_", " ")} ({timeAgo})
        </span>
      )}
    </span>
  );
}

function formatCeiling(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  return String(n);
}

function formatDate(d: string): string {
  const date = new Date(d);
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function getTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
