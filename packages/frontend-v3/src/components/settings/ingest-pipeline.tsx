"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  useIngestStatus,
  useTriggerIngest,
  type IngestSourceStatus,
} from "@/hooks/use-ingest-status";

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatNextRun(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "Overdue";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `In ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `In ${hours}h`;
  const days = Math.round(hours / 24);
  return `In ${days}d`;
}

function formatDelta(source: IngestSourceStatus): string {
  const records = source.records_last_run;
  const total = records.new + records.updated;
  // New records were written -> show the positive delta.
  if (total > 0) return `+${total}`;
  // A run actually executed (we have a timestamp) but produced no new records:
  // confirm it was active rather than rendering an ambiguous "—".
  if (source.last_run_at) return `${records.fetched} checked`;
  // No run has ever executed for this source.
  return "—";
}

function StatusDot({ status }: { status: IngestSourceStatus["status"] }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        status === "healthy" && "bg-gda-green",
        status === "stale" && "bg-gda-amber",
        status === "error" && "bg-gda-red",
        status === "unknown" && "bg-muted-foreground",
      )}
    />
  );
}

function StatusLabel({ status }: { status: IngestSourceStatus["status"] }) {
  return (
    <span
      className={cn(
        "text-[11px] font-mono capitalize",
        status === "healthy" && "text-gda-green",
        status === "stale" && "text-gda-amber",
        status === "error" && "text-gda-red",
        status === "unknown" && "text-muted-foreground",
      )}
    >
      {status === "healthy" ? "Healthy" : status === "stale" ? "Stale" : status === "error" ? "Error" : "Unknown"}
    </span>
  );
}

function SourceDetail({
  source,
  isAdmin,
}: {
  source: IngestSourceStatus;
  isAdmin: boolean;
}) {
  const trigger = useTriggerIngest();
  const [showLogs, setShowLogs] = useState(false);

  const lastRunFormatted = source.last_run_at
    ? new Date(source.last_run_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "Never";

  const nextRunFormatted = source.next_run_at
    ? new Date(source.next_run_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "—";

  return (
    <div className="border-t border-border bg-gda-bg-base/50 px-4 py-3 space-y-2">
      <p className="font-mono text-xs font-semibold text-foreground">
        {source.display_name} — Detail
      </p>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11px]">
        <span className="text-muted-foreground">Last run:</span>
        <span className="text-foreground">{lastRunFormatted}</span>

        <span className="text-muted-foreground">Duration:</span>
        <span className="text-foreground">
          {source.last_run_duration_seconds != null
            ? `${source.last_run_duration_seconds} seconds`
            : "—"}
        </span>

        <span className="text-muted-foreground">Records fetched:</span>
        <span className="text-foreground">
          {source.records_last_run.fetched.toLocaleString()}
        </span>

        <span className="text-muted-foreground">Records new:</span>
        <span className="text-foreground">
          {source.records_last_run.new.toLocaleString()}
        </span>

        <span className="text-muted-foreground">Records updated:</span>
        <span className="text-foreground">
          {source.records_last_run.updated.toLocaleString()}
        </span>

        <span className="text-muted-foreground">Records skipped:</span>
        <span className="text-foreground">
          {source.records_last_run.skipped.toLocaleString()}
        </span>

        <span className="text-muted-foreground">Next scheduled:</span>
        <span className="text-foreground">
          {nextRunFormatted} (every {source.scheduled_interval_hours}h)
        </span>

        <span className="text-muted-foreground">Last error:</span>
        <span className={cn("text-foreground", source.last_error && "text-gda-red")}>
          {source.last_error ?? "None"}
        </span>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {isAdmin && (
          <button
            type="button"
            onClick={() => trigger.mutate(source.source_key)}
            disabled={trigger.isPending}
            className="rounded border border-gda-green bg-gda-green/10 px-3 py-1 text-[11px] font-mono text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
          >
            {trigger.isPending ? "Running…" : "▶ Run Now"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowLogs((v) => !v)}
          className="rounded border border-border px-3 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/30"
        >
          {showLogs ? "Hide Logs" : "View Logs"}
        </button>
      </div>

      {showLogs && (
        <pre className="mt-2 max-h-48 overflow-auto rounded border border-border bg-gda-panel p-2 font-mono text-[11px] text-muted-foreground">
          {source.log_lines && source.log_lines.length > 0
            ? source.log_lines.slice(-20).join("\n")
            : "No log lines available."}
        </pre>
      )}
    </div>
  );
}

function CreditsBar({ used, budget, pct }: { used: number; budget: number; pct: number }) {
  const barColor =
    pct > 90 ? "bg-gda-red" : pct > 70 ? "bg-gda-amber" : "bg-gda-green";
  const textColor =
    pct > 90 ? "text-gda-red" : pct > 70 ? "text-gda-amber" : "text-gda-green";

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-t border-border">
      <span className="font-mono text-[11px] text-muted-foreground">
        Credits: GovTribe {used.toLocaleString()} / {budget.toLocaleString()} used this month
      </span>
      <div className="flex-1 max-w-[120px] h-2 rounded-full bg-gda-bg-base border border-border overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={cn("font-mono text-[11px] font-semibold", textColor)}>
        {pct}%
      </span>
    </div>
  );
}

export function IngestPipelineSection() {
  const { data: sources, isLoading } = useIngestStatus();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-gda-bg-base" />
        ))}
      </div>
    );
  }

  if (!sources || sources.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No ingest sources found.</p>
    );
  }

  // Find GovTribe credits from any govtribe source
  const govtribeSource = sources.find(
    (s) => s.source_key === "govtribe" || s.source_key.startsWith("govtribe."),
  );
  const credits = govtribeSource?.credits;

  return (
    <div className="space-y-0">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_80px_80px_80px_50px] gap-2 px-3 py-1.5 border-b border-border">
        <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
          Source
        </span>
        <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
          Status
        </span>
        <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
          Last Run
        </span>
        <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
          Next Run
        </span>
        <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wide text-right">
          Δ
        </span>
      </div>

      {/* Source rows */}
      {sources.map((source) => {
        const isExpanded = expandedRow === source.source_key;
        const delta = formatDelta(source);
        const deltaColor = delta.startsWith("+")
          ? "text-gda-green"
          : "text-muted-foreground";

        return (
          <div key={source.source_key}>
            <button
              type="button"
              onClick={() =>
                setExpandedRow(isExpanded ? null : source.source_key)
              }
              className="grid w-full grid-cols-[1fr_80px_80px_80px_50px] gap-2 px-3 py-2 text-left hover:bg-gda-panel/50 transition-colors border-b border-border/50 cursor-pointer"
            >
              <span className="flex items-center gap-2 min-w-0">
                <StatusDot status={source.status} />
                <span className="font-mono text-xs text-foreground truncate">
                  {source.display_name}
                </span>
              </span>
              <StatusLabel status={source.status} />
              <span className="font-mono text-[11px] text-muted-foreground">
                {formatRelativeTime(source.last_run_at)}
              </span>
              <span
                className={cn(
                  "font-mono text-[11px]",
                  formatNextRun(source.next_run_at) === "Overdue"
                    ? "text-gda-amber"
                    : "text-muted-foreground",
                )}
              >
                {formatNextRun(source.next_run_at)}
              </span>
              <span
                className={cn(
                  "font-mono text-[11px] text-right",
                  deltaColor,
                )}
              >
                {delta}
              </span>
            </button>

            {isExpanded && (
              <SourceDetail source={source} isAdmin={isAdmin} />
            )}
          </div>
        );
      })}

      {/* GovTribe credits bar */}
      {credits && (
        <CreditsBar
          used={credits.used}
          budget={credits.budget}
          pct={credits.pct}
        />
      )}
    </div>
  );
}
