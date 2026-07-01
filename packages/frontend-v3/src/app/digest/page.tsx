"use client";

import { useState } from "react";
import { useDigest, useDigestRefresh } from "@/hooks/use-digest";
import type {
  DigestSignal,
  DigestLeadStory,
  GaoDecision,
  RegulatoryEntry,
  UpcomingSolicitation,
} from "@/hooks/use-digest";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  ExternalLink,
  FileText,
  Scale,
  ScrollText,
} from "lucide-react";
import CollapsibleSection from "@/components/digest/CollapsibleSection";
import GovConNews from "@/components/digest/GovConNews";
import WeeklySitrep from "@/components/digest/WeeklySitrep";
import WhatsAtRisk from "@/components/digest/WhatsAtRisk";

// ────────────────────────────────────────────────────────────
// Category filter tabs
// ────────────────────────────────────────────────────────────

type Category = "all" | "solicitation" | "gao_decision" | "regulation";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all", label: "All" },
  { key: "solicitation", label: "Solicitations" },
  { key: "regulation", label: "Regulations" },
  { key: "gao_decision", label: "GAO Decisions" },
];

// ────────────────────────────────────────────────────────────
// Page-level tabs
// ────────────────────────────────────────────────────────────

type PageTab = "digest" | "sitrep";

// ────────────────────────────────────────────────────────────
// Signal type badges
// ────────────────────────────────────────────────────────────

const SIGNAL_CONFIG: Record<
  DigestSignal["type"],
  { icon: typeof FileText; label: string; color: string }
> = {
  solicitation: { icon: FileText, label: "SOLICITATION", color: "text-gda-cyan" },
  gao_decision: { icon: Scale, label: "GAO DECISION", color: "text-gda-amber" },
  regulation: { icon: ScrollText, label: "REGULATION", color: "text-gda-green" },
};

// ────────────────────────────────────────────────────────────
// Time helpers
// ────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const now = Date.now();
  const target = new Date(dateStr).getTime();
  const days = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  if (days < 0) return "Expired";
  if (days === 0) return "Today";
  if (days === 1) return "1d";
  return `${days}d`;
}

function urgencyColor(dateStr: string | null): string {
  if (!dateStr) return "text-muted-foreground";
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 35) return "text-gda-red";
  if (days <= 50) return "text-gda-amber";
  return "text-muted-foreground";
}

// ────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────

export default function DigestPage() {
  const { data, isLoading, error } = useDigest();
  const refresh = useDigestRefresh();
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [activeTab, setActiveTab] = useState<PageTab>("digest");

  const lastUpdated = data?.last_updated
    ? new Date(data.last_updated).toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        month: "short",
        day: "numeric",
      })
    : null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-mono text-lg font-bold text-foreground">
            MARKET INTELLIGENCE DIGEST
          </h1>
          <p className="font-mono text-xs text-muted-foreground">
            Refreshed daily
          </p>
        </div>
        <Skeleton className="h-40 bg-gda-panel" />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-3">
            <Skeleton className="h-24 bg-gda-panel" />
            <Skeleton className="h-24 bg-gda-panel" />
            <Skeleton className="h-24 bg-gda-panel" />
          </div>
          <div className="lg:col-span-2 space-y-3">
            <Skeleton className="h-40 bg-gda-panel" />
            <Skeleton className="h-40 bg-gda-panel" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h1 className="font-mono text-lg font-bold text-foreground">
          MARKET INTELLIGENCE DIGEST
        </h1>
        <div className="rounded border border-border bg-gda-panel p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Unable to load digest data. Click refresh to regenerate.
          </p>
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="mt-3 inline-flex items-center gap-1.5 rounded border border-border bg-gda-bg-base px-3 py-1.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={12} className={refresh.isPending ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // Filter signals by category
  const filteredSignals =
    activeCategory === "all"
      ? data.signals.items
      : data.signals.items.filter((s) => s.type === activeCategory);

  return (
    <div className="space-y-5">
      {/* ─── Sticky Header ─────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-4 sticky-page-header">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="shrink-0 font-mono text-lg font-bold text-foreground">
                MARKET INTELLIGENCE DIGEST
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Daily briefing of market changes — solicitations, GAO decisions, regulations, budget moves, and agency intel.
              </p>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              Refreshed daily
              {lastUpdated ? ` \u00B7 Last updated: ${lastUpdated} ET` : ""}
            </p>
          </div>
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="inline-flex items-center gap-1.5 rounded border border-border bg-gda-panel px-2.5 py-1.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={12} className={refresh.isPending ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* ─── Page-level tabs (Digest / Weekly SITREP) ────── */}
        <div className="flex items-center gap-4 border-b border-border">
          <button
            onClick={() => setActiveTab("digest")}
            className={cn(
              "pb-1.5 font-mono text-xs transition-colors",
              activeTab === "digest"
                ? "border-b-2 border-gda-cyan text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Digest
          </button>
          <button
            onClick={() => setActiveTab("sitrep")}
            className={cn(
              "pb-1.5 font-mono text-xs transition-colors",
              activeTab === "sitrep"
                ? "border-b-2 border-gda-cyan text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Weekly SITREP
          </button>
        </div>

        {/* ─── Category tabs (only on Digest tab) ─────────── */}
        {activeTab === "digest" && (
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  "rounded px-2.5 py-1 font-mono text-xs transition-colors",
                  activeCategory === cat.key
                    ? "bg-gda-green/15 text-gda-green border border-gda-green/40"
                    : "border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Tab content ───────────────────────────────────── */}
      {activeTab === "sitrep" ? (
        <div className="rounded border border-border bg-gda-panel p-4">
          <WeeklySitrep />
        </div>
      ) : (
        <>
          {/* ─── Main grid ─────────────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-5">
            {/* ─── Left column (60%) ─────────────────────── */}
            <div className="lg:col-span-3 space-y-4">
              {/* Lead story */}
              {data.lead && (
                <CollapsibleSection id="lead-story" title="Today's Lead">
                  <LeadStoryContent lead={data.lead} />
                </CollapsibleSection>
              )}

              {/* Signal feed */}
              <CollapsibleSection id="signal-feed" title="Signal Feed">
                {filteredSignals.length === 0 ? (
                  <div className="text-center py-2">
                    <p className="font-mono text-xs text-muted-foreground">
                      No signals in this category yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredSignals.map((signal) => (
                      <SignalCard key={signal.id} signal={signal} />
                    ))}
                  </div>
                )}
              </CollapsibleSection>
            </div>

            {/* ─── Right column (40%) ────────────────────── */}
            <div className="lg:col-span-2 space-y-4">
              <WhatsAtRisk />

              <CollapsibleSection id="govcon-news" title="GovCon News">
                <GovConNews />
              </CollapsibleSection>

              <CollapsibleSection id="regulatory-tracker" title="Regulatory Tracker">
                <RegulatoryTrackerContent items={data.regulatory} />
              </CollapsibleSection>

              <CollapsibleSection id="upcoming-solicitations" title="Upcoming Solicitations">
                <UpcomingSolicitationsContent items={data.upcoming_solicitations} />
              </CollapsibleSection>

              <CollapsibleSection id="gao-watchlist" title="GAO Watchlist">
                <GaoWatchlistContent items={data.gao_watchlist} />
              </CollapsibleSection>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Lead Story Content (inner content, no wrapper)
// ────────────────────────────────────────────────────────────

function LeadStoryContent({ lead }: { lead: DigestLeadStory }) {
  return (
    <div className="space-y-2">
      <h3 className="font-mono text-sm font-bold text-foreground leading-tight">
        {lead.headline}
      </h3>
      <p className="font-mono text-xs text-muted-foreground leading-relaxed">
        {lead.body}
      </p>
      <div className="flex items-center gap-3 pt-1">
        {lead.related_opportunity_ids.length > 0 && (
          <a
            href={
              lead.related_opportunity_ids.length === 1
                ? `/opportunities?id=${lead.related_opportunity_ids[0]}`
                : `/opportunities`
            }
            className="font-mono text-[11px] text-gda-cyan hover:underline"
          >
            {"\u2192"} View {lead.related_opportunity_ids.length} related{" "}
            {lead.related_opportunity_ids.length === 1 ? "opportunity" : "opportunities"}
          </a>
        )}
        {lead.source_url && (
          <a
            href={lead.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            {lead.source_label || "Source"}
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Signal Card
// ────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: DigestSignal }) {
  const cfg = SIGNAL_CONFIG[signal.type];
  const Icon = cfg.icon;

  return (
    <div className="rounded border border-border bg-gda-panel p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={13} className={cfg.color} />
          <span className={cn("font-mono text-[11px] font-bold uppercase tracking-wider", cfg.color)}>
            {cfg.label}
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
          {relativeTime(signal.posted_at)}
        </span>
      </div>

      <h4 className="font-mono text-xs font-semibold text-foreground leading-tight">
        {signal.source_url ? (
          <a
            href={signal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gda-cyan hover:underline"
          >
            {signal.title}
          </a>
        ) : (
          signal.title
        )}
      </h4>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
        {signal.naics_code && <span>{signal.naics_code}</span>}
        {signal.value_estimate && <span>{"\u00B7"} {signal.value_estimate}</span>}
        {signal.agency && <span>{"\u00B7"} {signal.agency}</span>}
      </div>

      {/* AI summary */}
      {signal.ai_summary && (
        <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
          {signal.ai_summary}
        </p>
      )}

      {/* Source link */}
      {signal.source_url && (
        <a
          href={signal.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          View source <ExternalLink size={9} />
        </a>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Regulatory Tracker Content
// ────────────────────────────────────────────────────────────

function RegulatoryTrackerContent({ items }: { items: RegulatoryEntry[] }) {
  if (items.length === 0) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        No active regulatory items tracked.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.id} className="min-w-0">
          {item.source_url ? (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-foreground hover:text-gda-cyan hover:underline truncate block"
            >
              {item.title}
            </a>
          ) : (
            <span className="font-mono text-[11px] text-foreground truncate block">
              {item.title}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Upcoming Solicitations Content
// ────────────────────────────────────────────────────────────

function UpcomingSolicitationsContent({ items }: { items: UpcomingSolicitation[] }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[11px] text-muted-foreground">
        In Envision{"'"}s NAICS space
      </p>
      {items.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">
          No upcoming solicitations in tracked NAICS codes.
        </p>
      ) : (
        <>
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <a
                  href={`/opportunities?id=${item.id}`}
                  className="font-mono text-[11px] text-foreground hover:text-gda-cyan hover:underline truncate block"
                >
                  {item.title}
                </a>
              </div>
              <span
                className={cn(
                  "font-mono text-[11px] font-bold whitespace-nowrap",
                  urgencyColor(item.response_due_at),
                )}
              >
                {daysUntil(item.response_due_at)} closes
              </span>
            </div>
          ))}
          <a
            href="/opportunities"
            className="block font-mono text-[11px] text-gda-cyan hover:underline pt-1"
          >
            View all {"\u2192"}
          </a>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// GAO Watchlist Content
// ────────────────────────────────────────────────────────────

function outcomeStyle(outcome: string | null): string {
  switch (outcome) {
    case "sustained":
      return "text-gda-green";
    case "denied":
      return "text-gda-red";
    case "dismissed":
      return "text-muted-foreground";
    case "withdrawn":
      return "text-muted-foreground";
    default:
      return "text-gda-amber";
  }
}

function outcomeLabel(outcome: string | null): string {
  if (!outcome) return "Pending...";
  return outcome.charAt(0).toUpperCase() + outcome.slice(1);
}

function GaoWatchlistContent({ items }: { items: GaoDecision[] }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[11px] text-muted-foreground">
        Protests affecting Envision{"'"}s space
      </p>
      {items.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">
          No GAO decisions tracked yet.
        </p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              {item.source_url ? (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-foreground hover:text-gda-cyan hover:underline truncate block"
                >
                  {item.title ?? item.decision_number}
                </a>
              ) : (
                <span className="font-mono text-[11px] text-foreground truncate block">
                  {item.title ?? item.decision_number}
                </span>
              )}
            </div>
            <span className={cn("font-mono text-[11px] font-bold whitespace-nowrap", outcomeStyle(item.outcome))}>
              {outcomeLabel(item.outcome)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
