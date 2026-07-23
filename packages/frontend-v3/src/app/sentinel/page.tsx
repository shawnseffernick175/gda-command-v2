"use client";

import { useState } from "react";
import {
  useSentinelHandoffs,
  useSentinelRecentWins,
  useSentinelUpcomingBreaks,
  useSentinelCreditPacingGovWin,
} from "@/hooks/use-sentinel-monitor";
import { cn } from "@/lib/utils";
import type {
  SentinelHandoffCard,
  SentinelRecentWinCard,
  SentinelUpcomingBreakCard,
} from "@/lib/types";

/* ── Card Components ───────────────────────────────────────────── */

function HandoffCardRow({ card }: { card: SentinelHandoffCard }) {
  const [showDetails, setShowDetails] = useState(false);
  const borderClass =
    card.severity === "critical"
      ? "border-l-4 border-l-gda-red"
      : card.severity === "warning"
        ? "border-l-4 border-l-amber-500"
        : "border-l-4 border-l-border";

  return (
    <div className={cn("rounded border border-border bg-white p-4", borderClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">{card.title}</p>
          {card.context && (
            <p className="text-xs text-muted-foreground">{card.context}</p>
          )}
          {card.due_by && (
            <p className="text-[12px] text-muted-foreground">
              Due by: {new Date(card.due_by).toLocaleDateString("en-US", { timeZone: "America/New_York" })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {card.action_label && (
            card.action_url ? (
              <a
                href={card.action_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-accent bg-accent/10 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/20"
              >
                {card.action_label}
              </a>
            ) : (
              <span className="rounded border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                {card.action_label}
              </span>
            )
          )}
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            {showDetails ? "Hide details" : "Show details"}
          </button>
        </div>
      </div>
      {showDetails && (
        <div className="mt-2 rounded border border-border bg-gda-bg-base p-3 text-xs text-muted-foreground font-mono">
          <p>Source: {card.source_key ?? "system"}</p>
          <p>Severity: {card.severity}</p>
          <p>Created: {new Date(card.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</p>
          <p>ID: {card.id}</p>
        </div>
      )}
    </div>
  );
}

function RecentWinRow({ card }: { card: SentinelRecentWinCard }) {
  return (
    <div className="flex items-center gap-3 rounded border border-border bg-white px-4 py-3">
      <span className="h-2 w-2 shrink-0 rounded-full bg-gda-green" />
      <div className="flex-1 space-y-0.5">
        <p className="text-sm text-foreground">{card.title}</p>
        {card.context && (
          <p className="text-xs text-muted-foreground">{card.context}</p>
        )}
      </div>
      <span className="text-[12px] text-muted-foreground shrink-0">
        {timeAgo(new Date(card.created_at))}
      </span>
    </div>
  );
}

function UpcomingBreakRow({ card }: { card: SentinelUpcomingBreakCard }) {
  const [showDetails, setShowDetails] = useState(false);
  const borderClass =
    card.severity === "critical"
      ? "border-l-4 border-l-gda-red"
      : card.severity === "warning"
        ? "border-l-4 border-l-amber-500"
        : "border-l-4 border-l-border";

  return (
    <div className={cn("rounded border border-border bg-white p-4", borderClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">{card.title}</p>
          {card.context && (
            <p className="text-xs text-muted-foreground">{card.context}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {card.action_label && (
            card.action_url ? (
              <a
                href={card.action_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-accent bg-accent/10 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/20"
              >
                {card.action_label}
              </a>
            ) : (
              <span className="rounded border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                {card.action_label}
              </span>
            )
          )}
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            {showDetails ? "Hide" : "Details"}
          </button>
        </div>
      </div>
      {showDetails && (
        <div className="mt-2 rounded border border-border bg-gda-bg-base p-3 text-xs text-muted-foreground font-mono">
          <p>Severity: {card.severity}</p>
          {card.due_by && <p>Due: {new Date(card.due_by).toLocaleDateString("en-US", { timeZone: "America/New_York" })}</p>}
          <p>Created: {new Date(card.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</p>
        </div>
      )}
    </div>
  );
}

/* ── Credit Pacing Section ─────────────────────────────────────── */

function CreditPacingSection() {
  const { data: govwin, isLoading: gwLoading } = useSentinelCreditPacingGovWin();

  if (gwLoading) {
    return <LoadingSkeleton rows={3} />;
  }

  return (
    <div className="space-y-4">
      {/* GovWin Volume */}
      {govwin && (
        <div className="rounded border border-border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">GovWin API Volume</p>
            <span className={cn(
              "rounded px-2 py-0.5 text-[12px] font-medium",
              govwin.auth_status.token_valid
                ? "bg-gda-green/10 text-gda-green"
                : "bg-red-500/10 text-red-500",
            )}>
              {govwin.auth_status.token_valid ? "Authenticated" : "Auth expired"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricCell label="Calls this month" value={`${govwin.calls_mtd}`} />
            <MetricCell label="Avg daily" value={`${govwin.avg_daily_calls}`} />
            <MetricCell
              label="Token expires in"
              value={govwin.auth_status.token_valid ? `${govwin.auth_status.expires_in_minutes} min` : "Expired"}
              alert={!govwin.auth_status.token_valid}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared UI pieces ──────────────────────────────────────────── */

function MetricCell({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-mono font-medium", alert ? "text-amber-500" : "text-foreground")}>{value}</p>
    </div>
  );
}

function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded border border-border bg-gda-bg-base" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded border border-border bg-white px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ── Page Component ────────────────────────────────────────────── */

export default function SentinelPage() {
  const { data: handoffs, isLoading: handoffsLoading } = useSentinelHandoffs();
  const { data: wins, isLoading: winsLoading } = useSentinelRecentWins();
  const { data: breaks, isLoading: breaksLoading } = useSentinelUpcomingBreaks();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-section font-semibold text-foreground">Sentinel</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Operations status in plain English. What needs you, what just worked, and what is about to break.
        </p>
      </div>

      {/* Section 1: Waiting on you */}
      <section className="space-y-3">
        <SectionHeader title="Waiting on you" count={handoffs?.count} />
        {handoffsLoading ? (
          <LoadingSkeleton rows={3} />
        ) : !handoffs?.items.length ? (
          <EmptyState message="Nothing waiting on you right now. All clear." />
        ) : (
          <div className="space-y-2">
            {handoffs.items.map((card) => (
              <HandoffCardRow key={card.id} card={card} />
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Recent wins */}
      <section className="space-y-3">
        <SectionHeader title="Recent wins" subtitle="Last 24 hours" count={wins?.count} />
        {winsLoading ? (
          <LoadingSkeleton rows={3} />
        ) : !wins?.items.length ? (
          <EmptyState message="No completed operations in the last 24 hours." />
        ) : (
          <div className="space-y-1.5">
            {wins.items.map((card) => (
              <RecentWinRow key={card.id} card={card} />
            ))}
          </div>
        )}
      </section>

      {/* Section 3: About to break */}
      <section className="space-y-3">
        <SectionHeader title="About to break" count={breaks?.count} />
        {breaksLoading ? (
          <LoadingSkeleton rows={2} />
        ) : !breaks?.items.length ? (
          <EmptyState message="No upcoming issues detected. Systems healthy." />
        ) : (
          <div className="space-y-2">
            {breaks.items.map((card) => (
              <UpcomingBreakRow key={card.id} card={card} />
            ))}
          </div>
        )}
      </section>

      {/* Section 4: Credit pacing */}
      <section className="space-y-3">
        <SectionHeader title="Credit pacing" />
        <CreditPacingSection />
      </section>
    </div>
  );
}

function SectionHeader({ title, subtitle, count }: { title: string; subtitle?: string; count?: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="font-mono text-sm font-semibold text-foreground">{title}</h2>
      {count != null && count > 0 && (
        <span className="rounded-full bg-gda-bg-base px-2 py-0.5 text-[12px] font-mono text-muted-foreground">
          {count}
        </span>
      )}
      {subtitle && (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      )}
    </div>
  );
}
